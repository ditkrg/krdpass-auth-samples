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

// Local SDK override (optional): to develop against unpublished core changes, clone
// ditkrg/krdpass-auth-sdk-android next to this repo (or pass -PkrdpassSdkDir=/path).
// Otherwise the core resolves from Maven Central (see android/build.gradle.kts). Guarded
// so a clean checkout without the sibling SDK still builds.
val krdpassSdkDir: String? = providers.gradleProperty("krdpassSdkDir").orNull
    ?: listOf("../../../krdpass-auth-sdk-android", "../../krdpass-auth-sdk-android")
        .firstOrNull { file(it).resolve("settings.gradle.kts").exists() }
if (krdpassSdkDir != null) {
    includeBuild(krdpassSdkDir) {
        dependencySubstitution {
            substitute(module("krd.pass:krdpass-auth")).using(project(":library"))
        }
    }
}

plugins {
    id("dev.flutter.flutter-plugin-loader") version "1.0.0"
    id("com.android.application") version "9.2.0" apply false
    id("org.jetbrains.kotlin.android") version "2.2.20" apply false
}

include(":app")
