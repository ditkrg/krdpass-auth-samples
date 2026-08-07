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

    /// App Store listing for KRDPASS, set only when sign-in failed with
    /// `provider_not_installed`. It is the one auth failure the user can fix, so the UI
    /// offers it as a button instead of leaving them at a dead end.
    var installUrl: URL?

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

    /// Sign in, handling each authentication outcome on its own terms.
    ///
    /// `AuthResult` is a closed enum and both modes funnel into the same typed errors, so
    /// there is no reason to flatten them into one string:
    /// a cancellation is not a failure, a timeout is retryable, and `provider_not_installed`
    /// carries the App Store URL that fixes it.
    func signIn() async {
        isLoading = true
        errorMessage = nil
        installUrl = nil

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
        } catch KrdpassError.userCancelled {
            // The user backed out on purpose: drop the spinner, show no error.
        } catch KrdpassError.timeout {
            errorMessage = "KRDPASS did not respond in time. Try signing in again."
        } catch KrdpassError.busy {
            errorMessage = "A sign-in is already in progress. Finish or cancel it first."
        } catch KrdpassError.providerNotInstalled(installUrl: let url) {
            // The only failure with a recovery action. Keep the message short and let the
            // button do the work.
            errorMessage = "KRDPASS is not installed on this device."
            installUrl = url.flatMap(URL.init(string:))
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

        // AuthResult is a closed enum, so this switch is exhaustive: add a case to the SDK
        // and this stops compiling instead of silently landing in a `default`.
        switch authResult {
        case .success(let response):
            // 4. Exchange code for tokens via backend
            let tokenResponse = try await backendService.exchangeToken(
                code: response.code,
                state: parResponse.state ?? state,
                codeVerifier: pkce.codeVerifier
            )
            self.tokens = try Self.tokenResult(from: tokenResponse)

        // Map onto the same typed errors the direct signIn() path throws, so signIn() above
        // handles one set of outcomes whichever mode ran.
        case .cancelled(let rawDescription):
            throw KrdpassError.userCancelled(rawDescription: rawDescription)
        case .timeout:
            throw KrdpassError.timeout
        case .busy:
            throw KrdpassError.busy
        case .error(let authError):
            if authError.error == "provider_not_installed" {
                throw KrdpassError.providerNotInstalled(installUrl: authError.installUrl)
            }
            throw KrdpassError.authenticationFailed(authError.message, code: authError.error)
        }
    }

    /// Build a `KrdpassTokenResult` from the backend response.
    ///
    /// `KrdpassTokenResult(dictionary:)` returns nil only when `accessToken` is absent or
    /// empty, which means the backend returned no usable token. Inventing an `expiresIn`
    /// to construct one anyway would fabricate a token lifetime and then silently use an
    /// access token the caller never actually got. Fail instead.
    private static func tokenResult(from response: TokenResponseDTO) throws -> KrdpassTokenResult {
        guard let result = KrdpassTokenResult(dictionary: response.asDictionary) else {
            throw SignInError(message: "The backend returned no access token.")
        }
        return result
    }

    // MARK: - Deep Link Handling

    func handleDeepLink(_ url: URL) {
        if krdpassAuth.canHandle(url) {
            krdpassAuth.handle(url)
        }
    }

    // MARK: - Logout

    /// Sign out.
    ///
    /// Clearing the local fields is the visible half. The half that matters is revoking the
    /// refresh token, because a refresh token left alive keeps working long after the user
    /// believes they signed out.
    ///
    /// Neither the SDK nor the reference BFF exposes an RP-initiated end-session endpoint,
    /// so this is as far as a client can take it: the grant is revoked, but any access token
    /// already issued stays valid until it expires. If your deployment adds an end-session
    /// endpoint, call it here as well.
    func logout() async {
        let session = tokens
        clearSession()
        guard let session else { return }
        // Best effort: the local session is already gone and there is no screen left to
        // retry from, so never block sign-out on the network.
        try? await revokeSessionTokens(session)
    }

    /// Drop local state only. Callers that also need the grant revoked use `logout()`.
    private func clearSession() {
        tokens = nil
        userInfo = nil
        errorMessage = nil
        installUrl = nil
        isLoading = false
    }

    /// Revoke the refresh token first, then the access token.
    ///
    /// Order matters: the refresh token is what lets a holder mint new access tokens, so it
    /// is the credential an attacker wants. Revoking only the access token, which is what a
    /// "logout" that clears local fields effectively does, leaves the grant alive server-side.
    private func revokeSessionTokens(_ session: KrdpassTokenResult) async throws {
        var targets: [(String, String)] = []
        if let refreshToken = session.refreshToken { targets.append((refreshToken, "refresh_token")) }
        targets.append((session.accessToken, "access_token"))

        for (token, hint) in targets {
            if useServerMode {
                try await backendService.revokeToken(
                    token: token,
                    environment: Config.environment,
                    tokenTypeHint: hint
                )
            } else {
                try await krdpassAuth.revokeToken(token: token)
            }
        }
    }

    // MARK: - User Info

    func fetchUserInfo() async {
        guard tokens != nil else { return }

        isLoading = true
        errorMessage = nil

        do {
            // Every call that carries the access token goes through this rather than
            // `tokens?.accessToken`, so expiry is handled where the token is used instead of
            // by a button the user has to remember to press.
            let accessToken = try await validAccessToken()
            let info = try await krdpassAuth.getUserInfo(accessToken: accessToken)
            self.userInfo = info
            flashMessage(.ok("User info synced"))
            self.isLoading = false
        } catch {
            flashMessage(.failed("Sync failed: \(error.localizedDescription)"))
            self.isLoading = false
        }
    }

    /// The access token to send with the next API call, refreshed first if it has expired.
    ///
    /// `KrdpassTokenResult.isExpired(skewSeconds:)` compares `receivedAt + expiresIn`
    /// against now, with a skew allowance so a token that dies mid-flight does not slip
    /// through. This is the one thing every production integration needs and the one thing
    /// a "tap to refresh" button never demonstrates.
    private func validAccessToken() async throws -> String {
        guard let current = tokens else {
            throw SignInError(message: "Not signed in.")
        }
        guard current.isExpired() else { return current.accessToken }
        guard let refreshToken = current.refreshToken else {
            // No offline_access scope, so there is nothing to refresh with. Sign in again.
            throw SignInError(message: "Session expired. Sign in again.")
        }
        let refreshed = try await refreshedTokens(using: refreshToken)
        self.tokens = refreshed
        return refreshed.accessToken
    }

    /// Exchange a refresh token for a new token set, via the backend or the SDK.
    private func refreshedTokens(using refreshToken: String) async throws -> KrdpassTokenResult {
        guard useServerMode else {
            return try await krdpassAuth.refreshTokens(refreshToken: refreshToken)
        }
        let response = try await backendService.refreshToken(
            refreshToken: refreshToken,
            environment: Config.environment
        )
        return try Self.tokenResult(from: response)
    }

    // MARK: - Clear Error

    func clearError() {
        errorMessage = nil
        installUrl = nil
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
        userInfo?.rawJsonObject ?? idTokenClaims
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

    var actionMessage: ActionMessage?
    private var actionMessageToken = 0

    /// Show a transient status message that auto-clears after 3s. A monotonic token guards the
    /// clear, so a newer message is never wiped early by an earlier call's timer.
    private func flashMessage(_ message: ActionMessage) {
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
            flashMessage(.failed("No ID token to verify"))
            return
        }
        isLoading = true
        actionMessage = nil
        do {
            // Verify signature using JWKS (audience is derived from the configured clientId)
            let _ = try await krdpassAuth.verifyToken(idToken: idToken)
            flashMessage(.ok("Token signature valid"))
        } catch {
            flashMessage(.failed("Invalid: \(error.localizedDescription)"))
        }
        isLoading = false
    }

    /// Refresh on demand, so the demo can show the exchange happening.
    ///
    /// Real code should not need this button: `validAccessToken()` above refreshes on expiry
    /// at the point of use, which is where it belongs.
    func refreshToken() async {
        guard !isLoading else { return }
        guard let token = tokens?.refreshToken else {
            flashMessage(.failed("No refresh token available"))
            return
        }
        isLoading = true
        actionMessage = nil
        do {
            self.tokens = try await refreshedTokens(using: token)
            flashMessage(.ok("Tokens refreshed"))
        } catch {
            flashMessage(.failed("Refresh failed: \(error.localizedDescription)"))
        }
        isLoading = false
    }

    /// Revoke the session's tokens. The refresh token is the one that matters: it is the
    /// long-lived credential, and revoking it is what actually ends the grant.
    func revokeToken() async {
        guard !isLoading else { return }
        guard let session = tokens else {
            flashMessage(.failed("No token to revoke"))
            return
        }
        isLoading = true
        actionMessage = nil
        do {
            try await revokeSessionTokens(session)
            clearSession()
            flashMessage(.ok("Tokens revoked, signed out"))
        } catch {
            flashMessage(.failed("Revoke failed: \(error.localizedDescription)"))
        }
        isLoading = false
    }
}

// MARK: - Action Message

/// A transient status line for the token-management actions.
///
/// `ok` is the state; `text` is only ever text. Keep them separate: encoding "this failed"
/// into the string (a prefix, an icon, a marker character) forces the view to parse the
/// message back apart, and that parser is wrong the first time a message legitimately
/// starts with the marker.
struct ActionMessage {
    let ok: Bool
    let text: String

    static func ok(_ text: String) -> ActionMessage { ActionMessage(ok: true, text: text) }
    static func failed(_ text: String) -> ActionMessage { ActionMessage(ok: false, text: text) }
}

// MARK: - Errors

/// Lightweight error that carries the SDK's canonical message for display.
struct SignInError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}
