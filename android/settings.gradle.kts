pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
    plugins {
        // AGP 9+ ships Kotlin built-in, so no separate kotlin.android plugin is declared.
        id("com.android.application") version "9.3.0"
    }
}

plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "DemoKrdPassAuth"
include(":app")

// --- Local SDK override (composite build) -------------------------------------------------
// On a clean checkout the core resolves from Maven Central (krd.pass:krdpass-auth, no token).
// To develop against unpublished SDK changes, clone ditkrg/krdpass-auth-sdk-android next to
// this repo (or pass -PkrdpassSdkDir=/path/to/checkout). Gradle then substitutes
// `krd.pass:krdpass-auth` with that source build, so you don't need the published artifact.
val krdpassSdkDir: String? = providers.gradleProperty("krdpassSdkDir").orNull
    ?: listOf("../../krdpass-auth-sdk-android", "../krdpass-auth-sdk-android")
        .firstOrNull { file(it).resolve("settings.gradle.kts").exists() }
if (krdpassSdkDir != null) {
    includeBuild(krdpassSdkDir) {
        // The SDK's library module is published as krd.pass:krdpass-auth but its Gradle project
        // name is :library, so map the coordinate explicitly for composite-build substitution.
        dependencySubstitution {
            substitute(module("krd.pass:krdpass-auth")).using(project(":library"))
        }
    }
}
