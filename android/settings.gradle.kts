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
// For deliberate local SDK development, pass
// -PkrdpassSdkDir=/path/to/krdpass-auth-sdk-android. Normal builds always use
// Maven Central so a neighboring checkout cannot silently mask publication issues.
val krdpassSdkDir: String? = providers.gradleProperty("krdpassSdkDir").orNull
    ?.takeIf { it.isNotBlank() }
if (krdpassSdkDir != null) {
    includeBuild(krdpassSdkDir) {
        // The SDK's library module is published as krd.pass:krdpass-auth but its Gradle project
        // name is :library, so map the coordinate explicitly for composite-build substitution.
        dependencySubstitution {
            substitute(module("krd.pass:krdpass-auth")).using(project(":library"))
        }
    }
}
