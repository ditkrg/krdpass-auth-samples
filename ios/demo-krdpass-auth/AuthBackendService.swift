//
//  AuthBackendService.swift
//  demo-krdpass-auth
//
//  Network service for backend PAR and token exchange.
//

import Foundation
import KrdpassAuth

/// Backend API service for server-mediated authentication
@MainActor
class AuthBackendService {
    private let baseUrl: String
    private let session: URLSession

    init(baseUrl: String, session: URLSession = .shared) {
        self.baseUrl = baseUrl
        self.session = session
    }

    /// Send a request, mapping transport failures (server down / no network) to a
    /// canonical message instead of leaking the system error string.
    private func send(_ request: URLRequest) async throws -> (Data, URLResponse) {
        do {
            return try await session.data(for: request)
        } catch is URLError {
            throw BackendError.unreachable
        }
    }

    /// Build an endpoint URL, surfacing a misconfigured base URL as a typed error instead of crashing.
    private func endpointURL(_ path: String) throws -> URL {
        guard let url = URL(string: baseUrl + path) else { throw BackendError.invalidURL }
        return url
    }

    /// POST a JSON body to `path` and decode the response. Shares the request/response plumbing
    /// (URL, headers, status-code -> typed error) across every backend call.
    private func post<T: Decodable>(_ path: String, body: [String: Any]) async throws -> T {
        try JSONDecoder().decode(T.self, from: try await postData(path, body: body))
    }

    /// POST a JSON body to `path` and return the raw response data, mapping transport failures
    /// and non-2xx responses to typed `BackendError`s. Used directly by callers that don't decode.
    @discardableResult
    private func postData(_ path: String, body: [String: Any]) async throws -> Data {
        var request = URLRequest(url: try endpointURL(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await send(request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw BackendError.invalidResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            throw BackendError.requestFailed(statusCode: httpResponse.statusCode, body: data)
        }
        return data
    }

    // MARK: - PAR Request

    /// Request a PAR (Pushed Authorization Request) from the backend
    func getRequestUri(
        codeChallenge: String,
        state: String,
        nonce: String? = nil,
        environment: KrdpassEnvironment,
        redirectUri: String,
        scope: String
    ) async throws -> ParResponseDTO {
        // Backend expects JSON body with camelCase keys
        var body: [String: Any] = [
            "codeChallenge": codeChallenge,
            "codeChallengeMethod": "S256",
            "state": state,
            "environment": environment.name,
            "redirectUri": redirectUri,
            "scope": scope
        ]
        if let nonce = nonce {
            body["nonce"] = nonce
        }
        return try await post("/oauth/par", body: body)
    }

    // MARK: - Token Exchange

    /// Exchange authorization code for tokens via backend
    func exchangeToken(
        code: String,
        state: String,
        codeVerifier: String
    ) async throws -> TokenResponseDTO {
        // Backend expects JSON body with camelCase keys
        let body: [String: Any] = [
            "code": code,
            "state": state,
            "codeVerifier": codeVerifier
        ]
        return try await post("/oauth/token", body: body)
    }

    // MARK: - Token Refresh

    /// Refresh tokens via backend.
    /// Proxies the request to POST /oauth/token/refresh to ensure the client secret remains secure.
    ///
    /// - Parameters:
    ///   - refreshToken: The refresh token from a previous session.
    ///   - environment: The KRDPASS environment.
    ///   - scope: Optional new scopes to request.
    /// - Returns: TokenResponseDTO with new tokens.
    func refreshToken(
        refreshToken: String,
        environment: KrdpassEnvironment,
        scope: String? = nil
    ) async throws -> TokenResponseDTO {
        var body: [String: Any] = [
            "refreshToken": refreshToken,
            "environment": environment.name
        ]
        if let scope = scope {
            body["scope"] = scope
        }
        return try await post("/oauth/token/refresh", body: body)
    }

    // MARK: - Token Revocation

    /// Revoke token via backend.
    /// Proxies the request to POST /oauth/token/revoke to invalidate the token.
    ///
    /// - Parameters:
    ///   - token: The token to revoke.
    ///   - environment: The KRDPASS environment.
    ///   - tokenTypeHint: Hint for the type of token (default: "access_token").
    func revokeToken(
        token: String,
        environment: KrdpassEnvironment,
        tokenTypeHint: String = "access_token"
    ) async throws {
        let body: [String: Any] = [
            "token": token,
            "tokenTypeHint": tokenTypeHint,
            "environment": environment.name
        ]
        try await postData("/oauth/token/revoke", body: body)
    }
}

// MARK: - DTOs

struct ParResponseDTO: Decodable, Sendable {
    let requestUri: String
    let state: String?
    let expiresIn: Int?
}

struct TokenResponseDTO: Decodable, Sendable {
    let accessToken: String
    let tokenType: String?
    let expiresIn: Int?
    let refreshToken: String?
    let idToken: String?
    let scope: String?

    var asDictionary: [String: Any] {
        var dict: [String: Any] = ["accessToken": accessToken]
        if let tokenType = tokenType { dict["tokenType"] = tokenType }
        if let expiresIn = expiresIn { dict["expiresIn"] = expiresIn }
        if let refreshToken = refreshToken { dict["refreshToken"] = refreshToken }
        if let idToken = idToken { dict["idToken"] = idToken }
        if let scope = scope { dict["scope"] = scope }
        return dict
    }
}

// MARK: - Errors

enum BackendError: LocalizedError {
    case requestFailed(statusCode: Int, body: Data)
    case invalidResponse
    case invalidURL
    case unreachable

    var errorDescription: String? {
        switch self {
        case .unreachable:
            return "Can't reach the backend. Check your connection and that the server is running."
        case let .requestFailed(statusCode, body):
            // Prefer the OAuth error_description / error from the response body;
            // otherwise fall back to a friendly label for the status family
            // (e.g. an unreachable backend returns a 5xx HTML page we don't want to show).
            if let json = try? JSONSerialization.jsonObject(with: body) as? [String: Any] {
                let detail = (json["error_description"] as? String) ?? (json["error"] as? String)
                if let detail, !detail.isEmpty {
                    return "\(detail) (HTTP \(statusCode))"
                }
            }
            let friendly: String
            switch statusCode {
            case 500...599: friendly = "The backend is unavailable right now. Make sure the backend server is running and reachable."
            case 401, 403: friendly = "The backend rejected this request (not authorized)."
            case 404: friendly = "Backend endpoint not found. Check the backend URL."
            default: friendly = "Request failed"
            }
            return "\(friendly) (HTTP \(statusCode))"
        case .invalidResponse:
            return "Unexpected response from the backend."
        case .invalidURL:
            return "Invalid backend URL configured. Check the backend URL."
        }
    }
}
