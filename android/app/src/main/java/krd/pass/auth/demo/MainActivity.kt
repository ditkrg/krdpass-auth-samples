package krd.pass.auth.demo

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import krd.pass.auth.KrdpassAuth
import krd.pass.auth.KrdpassConfig
import krd.pass.auth.KrdpassEnvironment
import krd.pass.auth.KrdpassLogger
import krd.pass.auth.demo.ui.MainScreen
import krd.pass.auth.demo.ui.theme.DemoSignInWithKrdPassTheme
import kotlinx.coroutines.delay

/**
 * A clean reference implementation for KRDPASS SDK integration. Demonstrates two flows:
 * 1. Direct (client-only): the SDK runs the OAuth logic directly with KRDPASS (CAS).
 * 2. Backend-mediated: recommended for production, your backend interacts with KRDPASS.
 *
 * All session state + orchestration lives in [DemoViewModel]; this Activity only initializes
 * and registers the SDK (which needs the Activity) and renders the collected state.
 */
class MainActivity : ComponentActivity() {

    private val viewModel: DemoViewModel by viewModels()

    private val redirectUri = BuildConfig.REDIRECT_URI
    private val clientId = BuildConfig.CLIENT_ID
    private val environment = when (BuildConfig.ENVIRONMENT.lowercase()) {
        "production", "prod" -> KrdpassEnvironment.Production
        else -> KrdpassEnvironment.Development
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialize once (ideally in Application.onCreate), then register this Activity for results.
        KrdpassAuth.initialize(
            KrdpassConfig(clientId = clientId, redirectUri = redirectUri, environment = environment)
        )
        KrdpassAuth.register(this)

        if (BuildConfig.DEBUG) {
            KrdpassAuth.logger = object : KrdpassLogger {
                override fun log(level: String, message: String) { Log.d("KRDPASS", "[$level] $message") }
            }
        }

        enableEdgeToEdge()
        setContent {
            DemoSignInWithKrdPassTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    AppContent(viewModel)
                }
            }
        }
    }
}

@Composable
private fun AppContent(viewModel: DemoViewModel) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    // Auto-clear the transient action message after 3 seconds.
    LaunchedEffect(state.actionMessage) {
        if (state.actionMessage != null) {
            delay(3000)
            viewModel.clearActionMessage()
        }
    }

    val context = LocalContext.current

    MainScreen(
        loading = state.loading,
        tokens = state.tokens,
        userInfo = state.userInfo,
        error = state.error,
        onSignIn = { withCitizen, withOffline, useServer -> viewModel.signIn(withCitizen, withOffline, useServer) },
        onFetchUserInfo = { accessToken -> viewModel.fetchUserInfo(accessToken) },
        onLogout = { viewModel.logout() },
        onClearError = { viewModel.clearError() },
        onVerifyToken = { viewModel.verifyToken() },
        onRefreshToken = { viewModel.refreshToken() },
        onRevokeToken = { viewModel.revokeToken() },
        actionMessage = state.actionMessage,
        installUrl = state.installUrl,
        onInstallProvider = { url ->
            // The SDK's install URL opens the Play Store listing, or KRDPASS itself if it
            // turns out to be installed after all.
            try {
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            } catch (_: ActivityNotFoundException) {
                // No browser and no store on this device. Nothing useful left to do.
            }
        },
    )
}
