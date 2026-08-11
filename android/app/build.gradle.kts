import java.util.Properties
import java.io.File

plugins {
    // AGP 9+ provides Kotlin built-in; only the Compose compiler plugin is applied separately.
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

kotlin {
    jvmToolchain(21)
}


val keystoreProperties = Properties()
val exampleRootDir = projectDir.parentFile
val keystorePropertiesFile = listOf(
    File(rootDir, "key.properties"),
    File(exampleRootDir, "key.properties"),
).firstOrNull { it.exists() } ?: File(exampleRootDir, "key.properties")
val hasKeystoreProperties = keystorePropertiesFile.exists()
if (hasKeystoreProperties) {
    keystorePropertiesFile.inputStream().use { keystoreProperties.load(it) }
}

// Load app configuration (backend URLs, etc.).
//
// Fail the build, not the app. Treating this file as optional produced an APK that installed
// fine, started, and then died on a require() in MainActivity, which is the worst place to
// learn that a config file is missing.
val configProperties = Properties()
val configPropertiesFile = listOf(
    File(rootDir, "config.properties"),
    File(exampleRootDir, "config.properties"),
).firstOrNull { it.exists() } ?: File(exampleRootDir, "config.properties")

fun missingConfig(what: String): Nothing = error(
    "KRDPASS demo config missing: $what. Copy android/config.properties.example to " +
        "android/config.properties and fill it in, or run ./scripts/sync-secrets.sh from the " +
        "repository root."
)

if (!configPropertiesFile.exists()) missingConfig("android/config.properties")
configPropertiesFile.inputStream().use { configProperties.load(it) }

// The example placeholder values compile (CI builds straight from config.properties.example)
// but must never run: MainActivity refuses to start against a placeholder, so a config mistake
// fails at launch with a message instead of as a DNS error three screens later.
fun requiredConfig(key: String): String {
    val value = configProperties.getProperty(key).orEmpty().trim()
    if (value.isEmpty()) missingConfig(key)
    return value
}

val backendUrlValue = requiredConfig("backendUrl")
val redirectUriValue = requiredConfig("redirectUri")
val clientIdValue = requiredConfig("clientId")
val environmentValue = configProperties.getProperty("environment", "development").trim().lowercase()
require(environmentValue in setOf("development", "production")) {
    "KRDPASS demo config invalid: environment must be development or production, got '$environmentValue'."
}

android {
    namespace = "krd.pass.auth.demo"
    compileSdk = 37

    defaultConfig {
        applicationId = "krd.pass.auth.demo"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.5.0"

        buildConfigField("String", "BACKEND_URL", "\"$backendUrlValue\"")
        buildConfigField("String", "REDIRECT_URI", "\"$redirectUriValue\"")
        buildConfigField("String", "CLIENT_ID", "\"$clientIdValue\"")
        buildConfigField("String", "ENVIRONMENT", "\"$environmentValue\"")
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    signingConfigs {
        if (hasKeystoreProperties) {
            create("demo") {
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                storeFile = keystoreProperties.getProperty("storeFile")?.trim()?.takeIf { it.isNotEmpty() }?.let { path ->
                    // `storeFile` in key.properties can be absolute or relative. Resolve relative paths
                    // against the sample root (where key.properties lives).
                    val candidate = File(path)
                    if (candidate.isAbsolute) candidate else File(exampleRootDir, path)
                }
                storePassword = keystoreProperties.getProperty("storePassword")
            }
        }
    }

    buildTypes {
        debug {
            if (hasKeystoreProperties) {
                signingConfig = signingConfigs.getByName("demo")
            }
        }
        release {
            isMinifyEnabled = false
            if (hasKeystoreProperties) {
                signingConfig = signingConfigs.getByName("demo")
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    implementation(libs.kotlinx.coroutines.android)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.core)
    implementation(libs.okhttp)
    debugImplementation(libs.androidx.compose.ui.tooling)
    // Resolved from Maven Central, or substituted from a local SDK checkout when the
    // composite-build override in settings.gradle.kts is active.
    implementation(libs.krdpass.auth)
}
