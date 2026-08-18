pluginManagement {
    val flutterSdkPath =
        run {
            val properties = java.util.Properties()
            file("local.properties").inputStream().use { properties.load(it) }
            val flutterSdkPath = properties.getProperty("flutter.sdk")
            require(flutterSdkPath != null) { "flutter.sdk not set in local.properties" }
            flutterSdkPath
        }

    includeBuild("$flutterSdkPath/packages/flutter_tools/gradle")

    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

// For deliberate local SDK development, pass
// -PkrdpassSdkDir=/path/to/krdpass-auth-sdk-android. Normal builds always use
// Maven Central so a neighboring checkout cannot silently mask publication issues.
val krdpassSdkDir: String? = providers.gradleProperty("krdpassSdkDir").orNull
    ?.takeIf { it.isNotBlank() }
if (krdpassSdkDir != null) {
    includeBuild(krdpassSdkDir) {
        dependencySubstitution {
            substitute(module("krd.pass:krdpass-auth")).using(project(":library"))
        }
    }
}

plugins {
    id("dev.flutter.flutter-plugin-loader") version "1.0.0"
    id("com.android.application") version "9.3.1" apply false
    // Must be declared: AGP 9 bundles Kotlin 2.2.10, below Flutter's 2.2.20 minimum.
    id("org.jetbrains.kotlin.android") version "2.4.10" apply false
}

include(":app")
