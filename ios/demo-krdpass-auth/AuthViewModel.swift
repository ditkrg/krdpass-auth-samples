import Foundation
import SwiftUI
import KrdpassAuth

@MainActor
@Observable
final class AuthViewModel {
    // MARK: - State

    var isSigningIn = false

    var isLoadingUserInfo = false

    var isBusy = false

    var tokens: KrdpassTokenResult? {
        // Decode once per token set. The claim views read these on every redraw.
        didSet {
            idTokenClaims = Self.decodedClaims(tokens?.idToken, auth: krdpassAuth)
            accessTokenClaims = Self.decodedClaims(tokens?.accessToken, auth: krdpassAuth)
        }
    }

    /// Decoded ID / access token claims (display only, NOT signature-verified).
    private(set) var idTokenClaims: [String: JSONValue] = [:]
    private(set) var accessTokenClaims: [String: JSONValue] = [:]

    private static func decodedClaims(_ token: String?, auth: KrdpassAuth) -> [String: JSONValue] {
        guard let token else { return [:] }
        // Access tokens are often opaque, so a failed decode is normal: show nothing.
        return (try? auth.decodeTokenUnverified(token)) ?? [:]
    }

    var userInfo: KrdpassUserInfo?
    var errorMessage: String?

    /// App Store listing for KRDPASS, set only when sign-in failed with
    /// `provider_not_installed`. It is the one auth failure the user can fix, so the UI
    /// offers it as a button instead of leaving them at a dead end.
    var installUrl: URL?

    var includeCitizenScope = true
    var includeOfflineScope = true
    var useServerMode = true

    // MARK: - Dependencies

    /// Not private: the app's root view attaches `.withKrdpassDeepLinkHandling(auth)` to it.
    let krdpassAuth: KrdpassAuth
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
        guard !isSigningIn else { return }
        isSigningIn = true
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
        } catch let error as KrdpassError where error.code == "cancelled" {
            // The user backed out on purpose: no error. Matching on the code
            // also catches a Deny tap, which comes back from CAS on the
            // redirect as `authenticationFailed` with `code == "cancelled"`.
        } catch KrdpassError.timeout {
            errorMessage = "KRDPASS did not respond in time. Try signing in again."
        } catch KrdpassError.busy {
            errorMessage = "A sign-in is already in progress. Finish or cancel it first."
        } catch KrdpassError.providerNotInstalled(installUrl: let url) {
            // The only failure with a recovery action: the button does the work.
            errorMessage = "KRDPASS is not installed on this device."
            installUrl = url.flatMap(URL.init(string:))
        } catch {
            errorMessage = error.localizedDescription
        }

        isSigningIn = false
    }

    private func signIn(scopes: [String]) async throws {
        let result = try await krdpassAuth.signIn(scopes: scopes)
        self.tokens = result
    }

    /// Server mode: the backend runs PAR and token exchange, while the provider
    /// launch and result still go through the SDK.
    private func signInWithServer(scopes: [String]) async throws {
        let pkce = try krdpassAuth.generatePkcePair()
        let state = try krdpassAuth.generateState()
        let nonce = try krdpassAuth.generateState()

        let parResponse = try await backendService.getRequestUri(
            codeChallenge: pkce.codeChallenge,
            state: state,
            nonce: nonce,
            environment: Config.environment,
            redirectUri: Config.redirectUri,
            scope: scopes.joined(separator: " ")
        )

        // Don't wait past the request_uri the backend just minted; the backend
        // copies expires_in from CAS unvalidated, so floor it at 1s.
        let authTimeout = TimeInterval(max(1, parResponse.expiresIn ?? 300))
        let authResult = await krdpassAuth.authenticate(
            requestUri: parResponse.requestUri,
            state: parResponse.state ?? state,
            timeout: authTimeout
        )

        // AuthResult is a closed enum, so this switch is exhaustive: add a case to the SDK
        // and this stops compiling instead of silently landing in a `default`.
        switch authResult {
        case .success(let response):
            let tokenResponse = try await backendService.exchangeToken(
                code: response.code,
                state: parResponse.state ?? state,
                codeVerifier: pkce.codeVerifier
            )
            self.tokens = try Self.tokenResult(from: tokenResponse)

        // Map onto the same typed errors the direct signIn() path throws, so signIn() above
        // handles one set of outcomes whichever mode ran.
        case .cancelled:
            throw KrdpassError.userCancelled
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

    /// `KrdpassTokenResult(dictionary:)` returns nil when `accessToken` is absent or empty,
    /// which means the backend returned no usable token. Fail rather than fabricate one.
    private static func tokenResult(from response: TokenResponseDTO) throws -> KrdpassTokenResult {
        guard let result = KrdpassTokenResult(dictionary: response.asDictionary) else {
            throw SignInError(message: "The backend returned no access token.")
        }
        return result
    }

    // MARK: - Logout

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
        isLoadingUserInfo = false
    }

    /// Revoke the refresh token first, then the access token. Order matters:
    /// the refresh token is what mints new access tokens, and revoking only the
    /// access token leaves the grant alive server-side.
    private func revokeSessionTokens(_ session: KrdpassTokenResult) async throws {
        var targets: [(String, String)] = []
        if let refreshToken = session.refreshToken { targets.append((refreshToken, "refresh_token")) }
        // An empty token would 400 at the server's own validation.
        if !session.accessToken.isEmpty { targets.append((session.accessToken, "access_token")) }

        for (token, hint) in targets {
            if useServerMode {
                try await backendService.revokeToken(
                    token: token,
                    environment: Config.environment,
                    tokenTypeHint: hint
                )
            } else {
                try await krdpassAuth.revokeToken(token: token, tokenTypeHint: hint)
            }
        }
    }

    // MARK: - User Info

    func fetchUserInfo() async {
        guard tokens != nil, !isLoadingUserInfo else { return }

        isLoadingUserInfo = true

        do {
            // Goes through validAccessToken() rather than `tokens?.accessToken`,
            // so expiry is handled where the token is used.
            let accessToken = try await validAccessToken()
            let info = try await krdpassAuth.getUserInfo(accessToken: accessToken)
            self.userInfo = info
            flashMessage(.ok("User info synced"))
            self.isLoadingUserInfo = false
        } catch {
            flashMessage(.failed("Sync failed: \(error.localizedDescription)"))
            self.isLoadingUserInfo = false
        }
    }

    /// The access token to send with the next API call, refreshed first if it
    /// has expired. Expiry is handled here, where the token is used, not by a
    /// button the user has to remember to press; `isExpired()` allows clock skew.
    private func validAccessToken() async throws -> String {
        guard let current = tokens else {
            throw SignInError(message: "Not signed in.")
        }
        guard current.isExpired() else { return current.accessToken }
        guard let refreshToken = current.refreshToken else {
            // No offline_access scope, so there is nothing to refresh with. Sign in again.
            throw SignInError(message: "Session expired. Sign in again.")
        }
        let refreshed = try await refreshedTokens(using: refreshToken, scope: current.scope)
        self.tokens = refreshed
        return refreshed.accessToken
    }

    /// Exchange a refresh token for a new token set, via the backend or the SDK.
    /// The scopes granted to the session are re-sent: an omitted `scope` leaves
    /// the decision to the server, which may silently narrow the grant.
    private func refreshedTokens(
        using refreshToken: String,
        scope: String?
    ) async throws -> KrdpassTokenResult {
        guard useServerMode else {
            return try await krdpassAuth.refreshTokens(refreshToken: refreshToken, scope: scope)
        }
        let response = try await backendService.refreshToken(
            refreshToken: refreshToken,
            environment: Config.environment,
            scope: scope
        )
        return try Self.tokenResult(from: response)
    }

    func clearError() {
        errorMessage = nil
        installUrl = nil
    }

    /// Merged claims from UserInfo (preferred) or ID Token
    private var claims: [String: JSONValue] {
        userInfo?.raw ?? idTokenClaims
    }

    private func claim(_ key: String) -> String? {
        claims[key]?.stringValue
    }

    var firstName: String {
        userInfo?.citizenFirst ?? claim("citizen_first") ?? ""
    }

    var fullName: String {
        userInfo?.citizenFullName ?? {
            let parts = [
                claim("citizen_first"),
                claim("citizen_second"),
                claim("citizen_third"),
                claim("citizen_surname")
            ].compactMap { $0 }.filter { !$0.isEmpty }

            if parts.isEmpty {
                return claim("upn") ?? "Citizen User"
            }
            return parts.joined(separator: " ")
        }()
    }

    var email: String {
        userInfo?.email ?? claim("email") ?? claim("upn") ?? "No email"
    }

    var birthdate: String? {
        userInfo?.birthdate ?? claim("birthdate")
    }

    var sex: String? {
        userInfo?.sexAtBirth ?? claim("sex_at_birth")
    }

    var profilePicUrl: String? {
        userInfo?.picture ?? claim("citizen_profile_picture")
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
        guard !isBusy else { return }
        guard let idToken = tokens?.idToken else {
            flashMessage(.failed("No ID token to verify"))
            return
        }
        isBusy = true
        actionMessage = nil
        do {
            // Verify signature using JWKS (audience is derived from the configured clientId)
            let _ = try await krdpassAuth.verifyToken(idToken: idToken)
            flashMessage(.ok("Token signature valid"))
        } catch {
            flashMessage(.failed("Invalid: \(error.localizedDescription)"))
        }
        isBusy = false
    }

    func refreshToken() async {
        guard !isBusy else { return }
        guard let current = tokens, let token = current.refreshToken else {
            flashMessage(.failed("No refresh token available"))
            return
        }
        isBusy = true
        actionMessage = nil
        do {
            self.tokens = try await refreshedTokens(using: token, scope: current.scope)
            flashMessage(.ok("Tokens refreshed"))
        } catch {
            flashMessage(.failed("Refresh failed: \(error.localizedDescription)"))
        }
        isBusy = false
    }

    func revokeToken() async {
        guard !isBusy else { return }
        guard let session = tokens else {
            flashMessage(.failed("No token to revoke"))
            return
        }
        isBusy = true
        actionMessage = nil
        do {
            try await revokeSessionTokens(session)
            clearSession()
            flashMessage(.ok("Tokens revoked, signed out"))
        } catch {
            flashMessage(.failed("Revoke failed: \(error.localizedDescription)"))
        }
        isBusy = false
    }
}

// MARK: - Action Message

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
