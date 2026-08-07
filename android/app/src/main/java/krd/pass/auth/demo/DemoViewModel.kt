package krd.pass.auth.demo

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import krd.pass.auth.AuthResult
import krd.pass.auth.KrdpassAuth
import krd.pass.auth.KrdpassError
import krd.pass.auth.KrdpassScopes
import krd.pass.auth.KrdpassTokenResult
import krd.pass.auth.KrdpassUserInfo
import krd.pass.auth.demo.network.AuthBackendService
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * A transient status line for the token-management actions.
 *
 * [ok] is the state; [text] is only ever text. Keep them separate: encoding "this failed" into
 * the string (a prefix, an icon, a marker character) forces the UI to parse the message back
 * apart, and that parser is wrong the first time a message legitimately starts with the marker.
 */
data class ActionMessage(val ok: Boolean, val text: String)

/** Immutable UI state for the demo screen: the single source of truth the ViewModel emits. */
data class DemoUiState(
    val loading: Boolean = false,
    val tokens: KrdpassTokenResult? = null,
    val userInfo: KrdpassUserInfo? = null,
    val error: String? = null,
    /**
     * Store listing for the KRDPASS app, set only when sign-in failed with
     * `provider_not_installed`. It is the one auth failure with a recovery action, so the UI
     * offers it as a button instead of leaving the user at a dead end.
     */
    val installUrl: String? = null,
    val isServerMode: Boolean = true,
    val actionMessage: ActionMessage? = null,
)

/**
 * Owns the demo's auth/session state and SDK orchestration, off the Activity, so the session
 * survives configuration changes (rotation) and the UI is a pure function of [uiState].
 *
 * `KrdpassAuth.register()` still happens in the Activity (it needs the Activity), but every flow
 * runs here on [viewModelScope]. Calls that drive the Activity result launcher
 * (`signIn` / `authenticate`) stay on the main dispatcher; only backend HTTP is moved to IO.
 */
class DemoViewModel : ViewModel() {

    private val redirectUri = BuildConfig.REDIRECT_URI
    private val environmentName =
        if (BuildConfig.ENVIRONMENT.lowercase() in setOf("production", "prod")) "production" else "development"

    private val backendService = AuthBackendService(BuildConfig.BACKEND_URL)

    private val _uiState = MutableStateFlow(DemoUiState())
    val uiState: StateFlow<DemoUiState> = _uiState.asStateFlow()

    /**
     * Sign in, handling each authentication outcome on its own terms.
     *
     * The SDK returns a closed set of outcomes and both modes funnel into the same typed
     * errors, so there is no reason to flatten them into one string:
     * a cancellation is not a failure, a timeout is retryable, and `provider_not_installed`
     * carries the store URL that fixes it.
     */
    fun signIn(withCitizen: Boolean, withOffline: Boolean, useServer: Boolean) {
        _uiState.update { it.copy(loading = true, error = null, installUrl = null) }
        viewModelScope.launch {
            val scopes = mutableListOf(KrdpassScopes.OPENID, KrdpassScopes.PROFILE).apply {
                if (withCitizen) add(KrdpassScopes.CITIZEN_IDENTITY)
                if (withOffline) add(KrdpassScopes.OFFLINE_ACCESS)
            }
            try {
                val tokens = if (useServer) signInWithServer(scopes) else KrdpassAuth.signIn(scopes)
                _uiState.update { it.copy(loading = false, tokens = tokens, isServerMode = useServer) }
            } catch (e: CancellationException) {
                // Rethrow: this is the coroutine being cancelled (screen closed, ViewModel
                // cleared), not an authentication failure. Swallowing it in the catch below
                // would break structured cancellation.
                throw e
            } catch (e: KrdpassError.UserCancelled) {
                // The user backed out on purpose: drop the spinner, show no error.
                _uiState.update { it.copy(loading = false) }
            } catch (e: KrdpassError.Timeout) {
                _uiState.update {
                    it.copy(loading = false, error = "KRDPASS did not respond in time. Try signing in again.")
                }
            } catch (e: KrdpassError.Busy) {
                _uiState.update {
                    it.copy(loading = false, error = "A sign-in is already in progress. Finish or cancel it first.")
                }
            } catch (e: KrdpassError.AuthenticationFailed) {
                // installUrl is non-null only for provider_not_installed. Passing it through is
                // what turns "something went wrong" into a working Install button.
                _uiState.update { it.copy(loading = false, error = e.message, installUrl = e.installUrl) }
            } catch (e: Exception) {
                _uiState.update { it.copy(loading = false, error = e.message) }
            }
        }
    }

    /**
     * Backend-mediated (BFF) sign-in: the backend runs PAR + token exchange (over IO), while the
     * provider launch + result still go through the SDK on the main dispatcher.
     */
    private suspend fun signInWithServer(scopes: List<String>): KrdpassTokenResult {
        val pkce = KrdpassAuth.generatePkcePair()
        val state = KrdpassAuth.generateState()
        val nonce = KrdpassAuth.generateState()
        val parResponse = withContext(Dispatchers.IO) {
            backendService.getRequestUri(
                codeChallenge = pkce.codeChallenge,
                state = state,
                nonce = nonce,
                environment = environmentName,
                redirectUri = redirectUri,
                scope = scopes.joinToString(" "),
            )
        }
        // Don't wait past the request_uri the backend just minted.
        val authTimeoutMillis = (parResponse.expiresIn ?: 300).coerceAtLeast(1) * 1000L
        // AuthResult is a sealed class, so this `when` is exhaustive: add a case to the SDK and
        // this stops compiling instead of silently landing in an `else`.
        return when (
            val authResult = KrdpassAuth.authenticate(
                parResponse.requestUri, parResponse.state, timeoutMillis = authTimeoutMillis)
        ) {
            is AuthResult.Success -> withContext(Dispatchers.IO) {
                backendService.exchangeToken(
                    code = authResult.code,
                    state = parResponse.state ?: state,
                    codeVerifier = pkce.codeVerifier,
                )
            }
            // Mirror the mapping KrdpassAuth.signIn() already performs for the direct path, so
            // signIn() above handles one typed set of failures whichever mode ran.
            is AuthResult.Cancelled -> throw KrdpassError.UserCancelled()
            is AuthResult.Timeout -> throw KrdpassError.Timeout()
            is AuthResult.Busy -> throw KrdpassError.Busy()
            is AuthResult.Error -> throw KrdpassError.AuthenticationFailed(
                authResult.message ?: authResult.error,
                code = authResult.error,
                installUrl = authResult.installUrl,
            )
        }
    }

    fun fetchUserInfo(accessToken: String) {
        _uiState.update { it.copy(loading = true) }
        viewModelScope.launch {
            try {
                val info = KrdpassAuth.getUserInfo(accessToken)
                _uiState.update {
                    it.copy(loading = false, userInfo = info, actionMessage = ActionMessage(true, "User info synced"))
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(loading = false, actionMessage = ActionMessage(false, "Sync failed: ${e.message}"))
                }
            }
        }
    }

    /**
     * Manual refresh, wired to a button so the demo can show it on demand.
     *
     * A real app should not wait for a button: check `tokens.isExpired()` before every call that
     * carries the access token and refresh when it returns true. The iOS and bare React Native
     * samples in this repo do exactly that; see their `validAccessToken` helpers.
     */
    fun refreshToken() {
        if (_uiState.value.loading) return // guard a double-tap firing two concurrent requests
        val refreshToken = _uiState.value.tokens?.refreshToken
        if (refreshToken == null) {
            _uiState.update { it.copy(actionMessage = ActionMessage(false, "No refresh token available")) }
            return
        }
        val serverMode = _uiState.value.isServerMode
        _uiState.update { it.copy(loading = true) }
        viewModelScope.launch {
            try {
                // Wrap only YOUR backend HTTP in IO; the SDK's suspend calls switch dispatchers themselves.
                val newTokens =
                    if (serverMode) withContext(Dispatchers.IO) { backendService.refreshToken(refreshToken = refreshToken, environment = environmentName) }
                    else KrdpassAuth.refreshTokens(refreshToken)
                _uiState.update {
                    it.copy(loading = false, tokens = newTokens, actionMessage = ActionMessage(true, "Tokens refreshed"))
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(loading = false, actionMessage = ActionMessage(false, "Refresh failed: ${e.message}"))
                }
            }
        }
    }

    /**
     * Revoke the session's tokens. The refresh token is the one that matters: it is the
     * long-lived credential, and revoking it is what actually ends the grant.
     */
    fun revokeToken() {
        if (_uiState.value.loading) return // guard a double-tap firing two concurrent requests
        val tokens = _uiState.value.tokens
        if (tokens == null) {
            _uiState.update { it.copy(actionMessage = ActionMessage(false, "No token to revoke")) }
            return
        }
        val serverMode = _uiState.value.isServerMode
        _uiState.update { it.copy(loading = true) }
        viewModelScope.launch {
            try {
                revokeSessionTokens(tokens, serverMode)
                _uiState.update {
                    it.copy(
                        loading = false,
                        tokens = null,
                        userInfo = null,
                        actionMessage = ActionMessage(true, "Tokens revoked, signed out"),
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(loading = false, actionMessage = ActionMessage(false, "Revoke failed: ${e.message}"))
                }
            }
        }
    }

    /**
     * Revoke the refresh token first, then the access token.
     *
     * Order matters: the refresh token is what lets a holder mint new access tokens, so it is
     * the credential an attacker wants. Revoking only the access token, which is what a
     * "logout" that clears local fields effectively does, leaves the grant alive on the server.
     */
    private suspend fun revokeSessionTokens(tokens: KrdpassTokenResult, serverMode: Boolean) {
        val toRevoke = listOfNotNull(
            tokens.refreshToken?.let { it to "refresh_token" },
            tokens.accessToken.takeIf { it.isNotBlank() }?.let { it to "access_token" },
        )
        for ((token, hint) in toRevoke) {
            if (serverMode) {
                withContext(Dispatchers.IO) {
                    backendService.revokeToken(token = token, environment = environmentName, tokenTypeHint = hint)
                }
            } else {
                KrdpassAuth.revokeToken(token, hint)
            }
        }
    }

    fun verifyToken() {
        if (_uiState.value.loading) return // guard a double-tap firing two concurrent requests
        val idToken = _uiState.value.tokens?.idToken
        if (idToken == null) {
            _uiState.update { it.copy(actionMessage = ActionMessage(false, "No ID token to verify")) }
            return
        }
        _uiState.update { it.copy(loading = true) }
        viewModelScope.launch {
            val message = try {
                // verifyToken is a suspend function and moves its own JWKS fetch to
                // Dispatchers.IO, so no withContext is needed here.
                KrdpassAuth.verifyToken(idToken)
                ActionMessage(true, "Token signature valid")
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                ActionMessage(false, "Invalid: ${e.message}")
            }
            _uiState.update { it.copy(loading = false, actionMessage = message) }
        }
    }

    /**
     * Sign out.
     *
     * Clearing the local fields is the visible half. The half that matters is revoking the
     * refresh token, because a refresh token left alive keeps working long after the user
     * believes they signed out.
     *
     * Neither the SDK nor the reference BFF exposes an RP-initiated end-session endpoint, so
     * this is as far as a client can take it: the grant is revoked, but any access token
     * already issued stays valid until it expires. If your deployment adds an end-session
     * endpoint, call it here as well.
     */
    fun logout() {
        val tokens = _uiState.value.tokens
        val serverMode = _uiState.value.isServerMode
        _uiState.update { it.copy(tokens = null, userInfo = null, error = null, installUrl = null) }
        if (tokens == null) return
        viewModelScope.launch {
            try {
                revokeSessionTokens(tokens, serverMode)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // Best effort. The local session is already gone and there is no screen left to
                // retry from, so surface nothing rather than block sign-out on the network.
            }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null, installUrl = null) }
    }

    fun clearActionMessage() {
        _uiState.update { it.copy(actionMessage = null) }
    }
}
