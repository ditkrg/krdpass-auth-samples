//
//  AuthViewModel.swift
//  demo-krdpass-auth
//
//  ViewModel for authentication state management.
//

import Foundation
import SwiftUI
import KrdpassAuth

/// Main view model for the demo app - manages authentication state
@MainActor
@Observable
final class AuthViewModel {
    // MARK: - State

    var isLoading = false
    var tokens: KrdpassTokenResult?
    var userInfo: KrdpassUserInfo?
    var errorMessage: String?

    // Configuration toggles
    var includeCitizenScope = true
    var includeOfflineScope = true
    var useServerMode = true
    
    // MARK: - Dependencies
    
    private let krdpassAuth: KrdpassAuth
    private let backendService: AuthBackendService
    
    // MARK: - Init
    
    init() {
        let config = KrdpassConfig(
            clientId: Config.clientId,
            redirectUri: Config.redirectUri,
            environment: Config.environment
        )
        self.krdpassAuth = KrdpassAuth(config: config)
        self.backendService = AuthBackendService(baseUrl: Config.backendUrl)
    }
    
    // MARK: - Auth Config
    
    var currentConfig: KrdpassConfig {
        krdpassAuth.currentConfig
    }
    
    // MARK: - Sign In
    
    func signIn() async {
        isLoading = true
        errorMessage = nil
        
        do {
            var scopes = [KrdpassScopes.openid, KrdpassScopes.profile]
            if includeCitizenScope {
                scopes.append(KrdpassScopes.citizenIdentity)
            }
            if includeOfflineScope {
                scopes.append(KrdpassScopes.offlineAccess)
            }
            
            if useServerMode {
                try await signInWithServer(scopes: scopes)
            } else {
                try await signIn(scopes: scopes)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        
        isLoading = false
    }
    
    /// Direct mode - SDK handles everything
    private func signIn(scopes: [String]) async throws {
        let result = try await krdpassAuth.signIn(scopes: scopes)
        self.tokens = result
    }
    
    /// Server mode - uses backend for PAR and token exchange
    private func signInWithServer(scopes: [String]) async throws {
        // 1. Generate PKCE pair + nonce
        let pkce = try krdpassAuth.generatePkcePair()
        let state = try krdpassAuth.generateState()
        let nonce = try krdpassAuth.generateState()
        
        // 2. Get request URI from backend
        let parResponse = try await backendService.getRequestUri(
            codeChallenge: pkce.codeChallenge,
            state: state,
            nonce: nonce,
            environment: Config.environment,
            redirectUri: Config.redirectUri,
            scope: scopes.joined(separator: " ")
        )

        // 3. Launch KRDPASS with request URI
        // The auth window matches the request_uri lifetime (floored at 1s), same as the
        // Android/Flutter/RN demos; the backend copies expires_in from CAS unvalidated.
        let authTimeout = TimeInterval(max(1, parResponse.expiresIn ?? 300))
        let authResult = await krdpassAuth.authenticate(
            requestUri: parResponse.requestUri,
            state: parResponse.state,
            timeout: authTimeout
        )
        
        switch authResult {
        case .success(let response):
            // 4. Exchange code for tokens via backend
            let tokenResponse = try await backendService.exchangeToken(
                code: response.code,
                state: parResponse.state ?? state,
                codeVerifier: pkce.codeVerifier,
                environment: Config.environment,
                redirectUri: Config.redirectUri
            )
            
            if let result = KrdpassTokenResult(dictionary: tokenResponse.asDictionary) {
                self.tokens = result
            } else {
                // Fallback to manual if asDictionary is missing or invalid
                self.tokens = KrdpassTokenResult(
                    accessToken: tokenResponse.accessToken,
                    idToken: tokenResponse.idToken,
                    tokenType: tokenResponse.tokenType ?? "Bearer",
                    expiresIn: tokenResponse.expiresIn ?? 3600,
                    refreshToken: tokenResponse.refreshToken,
                    scope: tokenResponse.scope
                )
            }
            
        default:
            throw SignInError(message: authResult.message ?? "Authentication failed")
        }
    }
    
    // MARK: - Deep Link Handling
    
    func handleDeepLink(_ url: URL) {
        if krdpassAuth.canHandle(url) {
            krdpassAuth.handle(url)
        }
    }
    
    // MARK: - Logout
    
    func logout() {
        tokens = nil
        userInfo = nil
        errorMessage = nil
        isLoading = false
    }

    // MARK: - User Info
    
    func fetchUserInfo() async {
        guard let accessToken = tokens?.accessToken else { return }
        
        isLoading = true
        errorMessage = nil
        
        do {
            let info = try await krdpassAuth.getUserInfo(accessToken: accessToken)
            self.userInfo = info
            flashMessage("✅ User Info Synced")
            self.isLoading = false
        } catch {
            flashMessage("❌ Sync Failed: \(error.localizedDescription)")
            self.isLoading = false
        }
    }
    
    // MARK: - Clear Error
    
    func clearError() {
        errorMessage = nil
    }
    
    /// Get decoded ID token claims (display only, NOT signature-verified).
    var idTokenClaims: [String: Any] {
        guard let idToken = tokens?.idToken else { return [:] }
        return (try? krdpassAuth.decodeTokenUnverified(idToken)) ?? [:]
    }

    /// Get decoded access token claims (display only, NOT signature-verified).
    var accessTokenClaims: [String: Any] {
        guard let accessToken = tokens?.accessToken else { return [:] }
        return (try? krdpassAuth.decodeTokenUnverified(accessToken)) ?? [:]
    }
    
    // MARK: - User Details (Data Logic)
    
    /// Merged claims from UserInfo (preferred) or ID Token
    private var claims: [String: Any] {
        userInfo?.raw ?? idTokenClaims
    }
    
    var firstName: String {
        userInfo?.citizenFirst ?? claims["citizen_first"] as? String ?? ""
    }
    
    var fullName: String {
        userInfo?.citizenFullName ?? {
            let parts = [
                claims["citizen_first"] as? String,
                claims["citizen_second"] as? String,
                claims["citizen_third"] as? String,
                claims["citizen_surname"] as? String
            ].compactMap { $0 }.filter { !$0.isEmpty }
            
            if parts.isEmpty {
                return claims["upn"] as? String ?? "Citizen User"
            }
            return parts.joined(separator: " ")
        }()
    }
    
    var email: String {
        userInfo?.email ?? claims["email"] as? String ?? claims["upn"] as? String ?? "No email"
    }
    
    var birthdate: String? {
        userInfo?.birthdate ?? claims["birthdate"] as? String
    }
    
    var sex: String? {
        userInfo?.sexAtBirth ?? claims["sex_at_birth"] as? String
    }
    
    var profilePicUrl: String? {
        userInfo?.picture ?? claims["citizen_profile_picture"] as? String
    }
    
    // MARK: - Token Management Actions
    
    var actionMessage: String?
    private var actionMessageToken = 0

    /// Show a transient status message that auto-clears after 3s. A monotonic token guards the
    /// clear, so a newer message is never wiped early by an earlier call's timer.
    private func flashMessage(_ message: String) {
        actionMessage = message
        actionMessageToken += 1
        let token = actionMessageToken
        Task {
            try? await Task.sleep(nanoseconds: 3 * 1_000_000_000)
            if actionMessageToken == token { actionMessage = nil }
        }
    }

    func verifyToken() async {
        guard !isLoading else { return }
        guard let idToken = tokens?.idToken else {
            flashMessage("❌ No ID Token to verify")
            return
        }
        isLoading = true
        actionMessage = nil
        do {
            // Verify signature using JWKS (audience is derived from the configured clientId)
            let _ = try await krdpassAuth.verifyToken(idToken: idToken)
            flashMessage("✅ Token Signature Valid")
        } catch {
            flashMessage("❌ Invalid: \(error.localizedDescription)")
        }
        isLoading = false
    }
    
    func refreshToken() async {
        guard !isLoading else { return }
        guard let token = tokens?.refreshToken else {
            flashMessage("❌ No Refresh Token available")
            return
        }
        isLoading = true
        actionMessage = nil
        do {
            let newTokens: KrdpassTokenResult
            
            if useServerMode {
                // Server mode: proxy via backend
                let response = try await backendService.refreshToken(
                    refreshToken: token,
                    environment: Config.environment
                )
                newTokens = KrdpassTokenResult(dictionary: response.asDictionary) ?? KrdpassTokenResult(
                    accessToken: response.accessToken,
                    idToken: response.idToken,
                    tokenType: response.tokenType ?? "Bearer",
                    expiresIn: response.expiresIn ?? 3600,
                    refreshToken: response.refreshToken,
                    scope: response.scope
                )
            } else {
                // Client mode: direct SDK call
                newTokens = try await krdpassAuth.refreshTokens(refreshToken: token)
            }
            
            self.tokens = newTokens
            flashMessage("✅ Tokens Refreshed")
        } catch {
            flashMessage("❌ Refresh Failed: \(error.localizedDescription)")
        }
        isLoading = false
    }
    
    func revokeToken() async {
        guard !isLoading else { return }
        guard let token = tokens?.accessToken else {
            flashMessage("❌ No Access Token to revoke")
            return
        }
        isLoading = true
        actionMessage = nil
        do {
            if useServerMode {
                // Server mode: proxy via backend
                try await backendService.revokeToken(
                    token: token,
                    environment: Config.environment,
                    tokenTypeHint: "access_token"
                )
            } else {
                // Client mode: direct SDK call
                try await krdpassAuth.revokeToken(token: token)
            }
            
            logout()
            flashMessage("✅ Token Revoked (Logged Out)")
        } catch {
            flashMessage("❌ Revoke Failed: \(error.localizedDescription)")
        }
        isLoading = false
    }
}

// MARK: - Errors

/// Lightweight error that carries the SDK's canonical message for display.
struct SignInError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}
