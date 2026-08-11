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
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * A transient status line. [ok] is the state; [text] is only ever text.
 * Encoding "this failed" into the string would force the UI to parse the
 * message back apart.
 */
data class ActionMessage(val ok: Boolean, val text: String)

/**
 * The identity the dashboard renders. Typed UserInfo accessors come first: the
 * UserInfo response is the fresher, SDK-normalised source. The ID token's raw
 * claims are the fallback, for before a sync and for untyped claims.
 */
data class DisplayIdentity(
    val firstName: String,
    val fullName: String,
    val email: String,
    val birthdate: String?,
    val sex: String?,
    val profilePicUrl: String?,
) {
    companion object {
        fun from(userInfo: KrdpassUserInfo?, idClaims: Map<String, Any?>): DisplayIdentity {
            val raw = userInfo?.raw ?: idClaims
            fun claim(key: String): String? =
                ((raw[key] ?: idClaims[key]) as? String)?.takeIf { it.isNotBlank() }

            return DisplayIdentity(
                firstName = userInfo?.citizenFirst ?: claim("citizen_first") ?: "",
                // The SDK already joins the four name parts (and drops the blank ones), so use
                // its accessor; the hand join below only covers the pre-sync raw claims.
                fullName = userInfo?.citizenFullName
                    ?: listOfNotNull(
                        claim("citizen_first"),
                        claim("citizen_second"),
                        claim("citizen_third"),
                        claim("citizen_surname"),
                    ).ifEmpty { null }?.joinToString(" ")
                    ?: userInfo?.name ?: claim("upn") ?: "Citizen User",
                email = userInfo?.email ?: claim("email") ?: claim("upn") ?: "No email",
                birthdate = userInfo?.birthdate ?: claim("birthdate"),
                sex = userInfo?.sexAtBirth ?: claim("sex_at_birth"),
                profilePicUrl = userInfo?.picture ?: claim("citizen_profile_picture"),
            )
        }
    }
}

/** Immutable UI state for the demo screen: the single source of truth the ViewModel emits. */
data class DemoUiState(
    /** A sign-in is in flight. */
    val signingIn: Boolean = false,
    /** A UserInfo sync is in flight. */
    val loadingUserInfo: Boolean = false,
    /** A token-management action (verify / refresh / revoke) is in flight. */
    val busy: Boolean = false,
    val tokens: KrdpassTokenResult? = null,
    val userInfo: KrdpassUserInfo? = null,
    val error: String? = null,
    /**
     * Store listing for the KRDPASS app, set only when sign-in failed with
     * `provider_not_installed`. It is the one auth failure with a recovery action, so the UI
     * offers it as a button instead of leaving the user at a dead end.
     */
    val installUrl: String? = null,
    val actionMessage: ActionMessage? = null,
    // Sign-in options. They live here rather than in `remember` so a rotation does not silently
    // reset the scopes the next sign-in will ask for.
    val includeCitizenScope: Boolean = true,
    val includeOfflineScope: Boolean = true,
    val useServerMode: Boolean = true,
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
    private val environmentName = BuildConfig.ENVIRONMENT

    private val backendService = AuthBackendService(BuildConfig.BACKEND_URL)

    private val _uiState = MutableStateFlow(DemoUiState())
    val uiState: StateFlow<DemoUiState> = _uiState.asStateFlow()

    private var actionMessageJob: Job? = null

    /**
     * Show a transient status line that clears itself after 3s. The pending
     * clear is cancelled on every new message, so a newer one is never wiped
     * early by an earlier call's timer.
     */
    private fun showStatus(message: ActionMessage) {
        _uiState.update { it.copy(actionMessage = message) }
        actionMessageJob?.cancel()
        actionMessageJob = viewModelScope.launch {
            delay(3000)
            _uiState.update { it.copy(actionMessage = null) }
        }
    }

    fun setCitizenScope(enabled: Boolean) = _uiState.update { it.copy(includeCitizenScope = enabled) }

    fun setOfflineScope(enabled: Boolean) = _uiState.update { it.copy(includeOfflineScope = enabled) }

    fun setServerMode(enabled: Boolean) = _uiState.update { it.copy(useServerMode = enabled) }

    /**
     * Sign in, handling each outcome on its own terms: a cancellation is not a
     * failure, a timeout is retryable, and `provider_not_installed` carries the
     * store URL that fixes it.
     */
    fun signIn() {
        val options = _uiState.value
        if (options.signingIn) return
        _uiState.update { it.copy(signingIn = true, error = null, installUrl = null) }
        viewModelScope.launch {
            val scopes = mutableListOf(KrdpassScopes.OPENID, KrdpassScopes.PROFILE).apply {
                if (options.includeCitizenScope) add(KrdpassScopes.CITIZEN_IDENTITY)
                if (options.includeOfflineScope) add(KrdpassScopes.OFFLINE_ACCESS)
            }
            try {
                val tokens =
                    if (options.useServerMode) signInWithServer(scopes) else KrdpassAuth.signIn(scopes)
                _uiState.update { it.copy(signingIn = false, tokens = tokens) }
            } catch (e: CancellationException) {
                // The coroutine being cancelled, not an auth failure; swallowing
                // it below would break structured cancellation.
                throw e
            } catch (e: KrdpassError.UserCancelled) {
                // The user backed out on purpose: drop the spinner, show no error.
                _uiState.update { it.copy(signingIn = false) }
            } catch (e: KrdpassError.Timeout) {
                _uiState.update {
                    it.copy(signingIn = false, error = "KRDPASS did not respond in time. Try signing in again.")
                }
            } catch (e: KrdpassError.Busy) {
                _uiState.update {
                    it.copy(signingIn = false, error = "A sign-in is already in progress. Finish or cancel it first.")
                }
            } catch (e: KrdpassError.AuthenticationFailed) {
                if (e.code == "cancelled") {
                    // A Deny tap comes back from CAS on the redirect, so it
                    // arrives as a failure rather than as UserCancelled. It is
                    // still the user's choice: no error, no red card.
                    _uiState.update { it.copy(signingIn = false) }
                } else {
                    // installUrl is non-null only for provider_not_installed. Passing it through
                    // is what turns "something went wrong" into a working Install button.
                    _uiState.update { it.copy(signingIn = false, error = e.message, installUrl = e.installUrl) }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(signingIn = false, error = e.message) }
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

    fun fetchUserInfo() {
        if (_uiState.value.loadingUserInfo) return
        _uiState.update { it.copy(loadingUserInfo = true) }
        viewModelScope.launch {
            try {
                // Goes through validAccessToken() rather than tokens.accessToken,
                // so expiry is handled where the token is used.
                val info = KrdpassAuth.getUserInfo(validAccessToken())
                _uiState.update { it.copy(loadingUserInfo = false, userInfo = info) }
                showStatus(ActionMessage(true, "User info synced"))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _uiState.update { it.copy(loadingUserInfo = false) }
                showStatus(ActionMessage(false, "Sync failed: ${e.message}"))
            }
        }
    }

    /**
     * The access token to send with the next API call, refreshed first if it
     * has expired. Expiry is handled here, where the token is used, not by a
     * button the user has to remember to press; `isExpired` allows clock skew.
     */
    private suspend fun validAccessToken(): String {
        val current = _uiState.value.tokens ?: error("Not signed in.")
        if (!current.isExpired()) return current.accessToken
        // No offline_access scope means there is nothing to refresh with: sign in again.
        val refreshToken = current.refreshToken ?: error("Session expired. Sign in again.")
        val refreshed = refreshedTokens(current, refreshToken)
        _uiState.update { it.copy(tokens = refreshed) }
        return refreshed.accessToken
    }

    /**
     * Exchange a refresh token for a new token set, via the backend or the SDK.
     * The scopes granted to the session are re-sent: an omitted `scope` lets
     * the server decide, which may silently narrow the grant.
     */
    private suspend fun refreshedTokens(
        current: KrdpassTokenResult,
        refreshToken: String,
    ): KrdpassTokenResult =
        if (_uiState.value.useServerMode) {
            // Wrap only YOUR backend HTTP in IO; the SDK's suspend calls switch dispatchers themselves.
            withContext(Dispatchers.IO) {
                backendService.refreshToken(
                    refreshToken = refreshToken,
                    environment = environmentName,
                    scope = current.scope,
                )
            }
        } else {
            KrdpassAuth.refreshTokens(refreshToken, current.scope)
        }

    /**
     * Refresh on demand, so the demo can show the exchange happening. Real code
     * should not need this button: [validAccessToken] refreshes at the point of use.
     */
    fun refreshToken() {
        if (_uiState.value.busy) return // guard a double-tap firing two concurrent requests
        val current = _uiState.value.tokens
        val refreshToken = current?.refreshToken
        if (refreshToken == null) {
            showStatus(ActionMessage(false, "No refresh token available"))
            return
        }
        _uiState.update { it.copy(busy = true) }
        viewModelScope.launch {
            try {
                val newTokens = refreshedTokens(current, refreshToken)
                _uiState.update { it.copy(busy = false, tokens = newTokens) }
                showStatus(ActionMessage(true, "Tokens refreshed"))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _uiState.update { it.copy(busy = false) }
                showStatus(ActionMessage(false, "Refresh failed: ${e.message}"))
            }
        }
    }

    /**
     * Revoke the session's tokens. The refresh token is the one that matters: it is the
     * long-lived credential, and revoking it is what actually ends the grant.
     */
    fun revokeToken() {
        if (_uiState.value.busy) return // guard a double-tap firing two concurrent requests
        val tokens = _uiState.value.tokens
        if (tokens == null) {
            showStatus(ActionMessage(false, "No token to revoke"))
            return
        }
        val serverMode = _uiState.value.useServerMode
        _uiState.update { it.copy(busy = true) }
        viewModelScope.launch {
            try {
                revokeSessionTokens(tokens, serverMode)
                _uiState.update { it.copy(busy = false, tokens = null, userInfo = null) }
                showStatus(ActionMessage(true, "Tokens revoked, signed out"))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _uiState.update { it.copy(busy = false) }
                showStatus(ActionMessage(false, "Revoke failed: ${e.message}"))
            }
        }
    }

    /**
     * Revoke the refresh token first, then the access token. Order matters: the
     * refresh token is what mints new access tokens, and revoking only the
     * access token leaves the grant alive server-side.
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
        if (_uiState.value.busy) return // guard a double-tap firing two concurrent requests
        val idToken = _uiState.value.tokens?.idToken
        if (idToken == null) {
            showStatus(ActionMessage(false, "No ID token to verify"))
            return
        }
        _uiState.update { it.copy(busy = true) }
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
            _uiState.update { it.copy(busy = false) }
            showStatus(message)
        }
    }

    /**
     * Sign out. Clearing the local fields is the visible half; the half that
     * matters is revoking the refresh token, which would otherwise keep working.
     * There is no end-session endpoint here, so issued access tokens stay valid
     * until they expire; if your deployment adds one, call it here as well.
     */
    fun logout() {
        val tokens = _uiState.value.tokens
        val serverMode = _uiState.value.useServerMode
        actionMessageJob?.cancel()
        _uiState.update {
            it.copy(tokens = null, userInfo = null, error = null, installUrl = null, actionMessage = null)
        }
        if (tokens == null) return
        viewModelScope.launch {
            try {
                revokeSessionTokens(tokens, serverMode)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // Best effort: the local session is already gone and there is
                // no screen left to retry from.
            }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null, installUrl = null) }
    }
}
