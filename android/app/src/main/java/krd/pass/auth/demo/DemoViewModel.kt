package krd.pass.auth.demo

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import krd.pass.auth.AuthResult
import krd.pass.auth.KrdpassAuth
import krd.pass.auth.KrdpassScopes
import krd.pass.auth.KrdpassTokenResult
import krd.pass.auth.KrdpassUserInfo
import krd.pass.auth.demo.network.AuthBackendService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.time.Duration.Companion.seconds

/** Immutable UI state for the demo screen: the single source of truth the ViewModel emits. */
data class DemoUiState(
    val loading: Boolean = false,
    val tokens: KrdpassTokenResult? = null,
    val userInfo: KrdpassUserInfo? = null,
    val error: String? = null,
    val isServerMode: Boolean = true,
    val actionMessage: String? = null,
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

    fun signIn(withCitizen: Boolean, withOffline: Boolean, useServer: Boolean) {
        _uiState.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val scopes = mutableListOf(KrdpassScopes.OPENID, KrdpassScopes.PROFILE).apply {
                if (withCitizen) add(KrdpassScopes.CITIZEN_IDENTITY)
                if (withOffline) add(KrdpassScopes.OFFLINE_ACCESS)
            }
            try {
                val tokens = if (useServer) signInWithServer(scopes) else KrdpassAuth.signIn(scopes)
                _uiState.update { it.copy(loading = false, tokens = tokens, isServerMode = useServer) }
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
        val authTimeout = (parResponse.expiresIn ?: 300).coerceAtLeast(1).seconds
        return when (
            val authResult = KrdpassAuth.authenticate(parResponse.requestUri, parResponse.state, timeout = authTimeout)
        ) {
            is AuthResult.Success -> withContext(Dispatchers.IO) {
                backendService.exchangeToken(
                    code = authResult.code,
                    state = parResponse.state ?: state,
                    codeVerifier = pkce.codeVerifier,
                    environment = environmentName,
                    redirectUri = redirectUri,
                )
            }
            else -> throw Exception(authResult.message ?: "Authentication failed")
        }
    }

    fun fetchUserInfo(accessToken: String) {
        _uiState.update { it.copy(loading = true) }
        viewModelScope.launch {
            try {
                val info = KrdpassAuth.getUserInfo(accessToken)
                _uiState.update { it.copy(loading = false, userInfo = info, actionMessage = "✅ User Info Synced") }
            } catch (e: Exception) {
                _uiState.update { it.copy(loading = false, actionMessage = "❌ Sync Failed: ${e.message}") }
            }
        }
    }

    fun refreshToken() {
        if (_uiState.value.loading) return // guard a double-tap firing two concurrent requests
        val refreshToken = _uiState.value.tokens?.refreshToken
        if (refreshToken == null) {
            _uiState.update { it.copy(actionMessage = "❌ No Refresh Token available") }
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
                _uiState.update { it.copy(loading = false, tokens = newTokens, actionMessage = "✅ Tokens Refreshed") }
            } catch (e: Exception) {
                _uiState.update { it.copy(loading = false, actionMessage = "❌ Refresh Failed: ${e.message}") }
            }
        }
    }

    fun revokeToken() {
        if (_uiState.value.loading) return // guard a double-tap firing two concurrent requests
        val accessToken = _uiState.value.tokens?.accessToken
        if (accessToken == null) {
            _uiState.update { it.copy(actionMessage = "❌ No Access Token to revoke") }
            return
        }
        val serverMode = _uiState.value.isServerMode
        _uiState.update { it.copy(loading = true) }
        viewModelScope.launch {
            try {
                if (serverMode) {
                    withContext(Dispatchers.IO) {
                        backendService.revokeToken(token = accessToken, environment = environmentName, tokenTypeHint = "access_token")
                    }
                } else {
                    KrdpassAuth.revokeToken(accessToken, "access_token")
                }
                _uiState.update {
                    it.copy(loading = false, tokens = null, userInfo = null, actionMessage = "✅ Token Revoked (Logged Out)")
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(loading = false, actionMessage = "❌ Revoke Failed: ${e.message}") }
            }
        }
    }

    fun verifyToken() {
        if (_uiState.value.loading) return // guard a double-tap firing two concurrent requests
        val idToken = _uiState.value.tokens?.idToken
        if (idToken == null) {
            _uiState.update { it.copy(actionMessage = "❌ No ID Token to verify") }
            return
        }
        _uiState.update { it.copy(loading = true) }
        viewModelScope.launch {
            val message = try {
                // verifyToken is a *blocking* JWKS fetch + verify (not a suspend fun), so it must be
                // moved off the main thread explicitly, unlike the suspend SDK calls above.
                withContext(Dispatchers.IO) { KrdpassAuth.verifyToken(idToken) }
                "✅ Token Signature Valid"
            } catch (e: Exception) {
                "❌ Invalid: ${e.message}"
            }
            _uiState.update { it.copy(loading = false, actionMessage = message) }
        }
    }

    fun logout() {
        _uiState.update { it.copy(tokens = null, userInfo = null, error = null) }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    fun clearActionMessage() {
        _uiState.update { it.copy(actionMessage = null) }
    }
}
