package krd.pass.auth.demo.ui

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import krd.pass.auth.KrdpassAuth
import krd.pass.auth.demo.ActionMessage
import krd.pass.auth.demo.DemoViewModel
import krd.pass.auth.demo.DisplayIdentity

/**
 * The demo's single screen: the landing form before sign-in, the dashboard after it.
 *
 * Screen-level composables take the ViewModel; the leaf cards below take plain values, so they
 * stay previewable and reusable. That is also what keeps the Activity down to "initialize the
 * SDK, register for results, render".
 */
@Composable
fun MainScreen(viewModel: DemoViewModel) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current

    Column(modifier = Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        // Above the landing/dashboard switch on purpose: "Tokens revoked, signed out" is
        // reported by the action that removes the dashboard, so a line rendered inside it
        // would never be seen.
        state.actionMessage?.let { ActionMessageLine(it) }

        Box(modifier = Modifier.weight(1f)) {
            val tokens = state.tokens
            if (tokens == null) {
                LandingScreen(
                    loading = state.signingIn,
                    error = state.error,
                    citizenScope = state.includeCitizenScope,
                    offlineScope = state.includeOfflineScope,
                    useServerMode = state.useServerMode,
                    onCitizenScopeChange = viewModel::setCitizenScope,
                    onOfflineScopeChange = viewModel::setOfflineScope,
                    onServerModeChange = viewModel::setServerMode,
                    onSignInClick = viewModel::signIn,
                    onClearError = viewModel::clearError,
                    installUrl = state.installUrl,
                    onInstallProvider = { url ->
                        // The SDK's install URL opens the Play Store listing, or KRDPASS itself
                        // if it turns out to be installed after all.
                        try {
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                        } catch (_: ActivityNotFoundException) {
                            // No browser and no store on this device. Nothing useful left to do.
                        }
                    },
                )
            } else {
                // Keyed on the token.
                val idClaims = remember(tokens.idToken) { claimsOf(tokens.idToken) }
                val accessClaims = remember(tokens.accessToken) { claimsOf(tokens.accessToken) }
                LoggedInDashboard(
                    identity = DisplayIdentity.from(state.userInfo, idClaims),
                    idClaims = idClaims,
                    accessClaims = accessClaims,
                    userInfo = state.userInfo,
                    isLoadingUserInfo = state.loadingUserInfo,
                    isBusy = state.busy,
                    onFetchUserInfo = viewModel::fetchUserInfo,
                    onLogout = viewModel::logout,
                    onVerifyToken = viewModel::verifyToken,
                    onRefreshToken = viewModel::refreshToken,
                    onRevokeToken = viewModel::revokeToken,
                )
            }
        }
    }
}

/** The transient result of a token-management action. */
@Composable
private fun ActionMessageLine(message: ActionMessage) {
    // The kind drives the icon and the colour; the text is only ever text.
    val tint =
        if (message.ok) MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
        else MaterialTheme.colorScheme.error
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            if (message.ok) Icons.Default.Info else Icons.Default.Warning,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(14.dp),
        )
        Spacer(Modifier.width(8.dp))
        Text(message.text, style = MaterialTheme.typography.bodySmall, color = tint)
    }
}

/**
 * decodeTokenUnverified is unverified: display only, never a trust decision. It throws on a
 * non-JWT, and access tokens are often opaque, so decode defensively.
 */
private fun claimsOf(token: String?): Map<String, Any?> =
    token?.let { runCatching { KrdpassAuth.decodeTokenUnverified(it) }.getOrNull() } ?: emptyMap()
