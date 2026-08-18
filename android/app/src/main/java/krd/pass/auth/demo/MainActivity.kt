package krd.pass.auth.demo

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import krd.pass.auth.KrdpassAuth
import krd.pass.auth.KrdpassConfig
import krd.pass.auth.KrdpassEnvironment
import krd.pass.auth.KrdpassLogger
import krd.pass.auth.demo.ui.MainScreen
import krd.pass.auth.demo.ui.theme.DemoSignInWithKrdPassTheme

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
    // build.gradle.kts rejects anything but development/production, so no fallback is needed here.
    private val environment =
        if (BuildConfig.ENVIRONMENT == "production") KrdpassEnvironment.Production
        else KrdpassEnvironment.Development

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // The example placeholders compile (CI builds from config.properties.example) but must
        // never run: failing here names the fix, where a placeholder URL fails as a DNS error
        // three screens later.
        check(clientId != "your-client-id" && !redirectUri.contains("your-backend.example.com")) {
            "KRDPASS demo config is still the example placeholders. Copy " +
                "android/config.properties.example to android/config.properties and fill it in, " +
                "or run ./scripts/sync-secrets.sh from the repository root."
        }

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
                    MainScreen(viewModel)
                }
            }
        }
    }
}
