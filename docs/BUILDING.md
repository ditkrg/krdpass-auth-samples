# Building the samples

## Repository layout

```text
android/            Android sample (Kotlin, Jetpack Compose)
ios/                iOS sample (Swift, SwiftUI)
flutter/            Flutter sample
react-native/       React Native sample (Expo)
react-native-bare/  React Native sample (bare, no Expo)
server/             Node.js BFF reference
scripts/            run-sample.sh and secret sync
shared/             Test vectors and contracts shared across samples
docs/               Integration guide, security policy, protocol spec
```

## Prerequisites

Only what the sample you are building needs:

| Sample | Needs |
| --- | --- |
| `android` | JDK 21, Android SDK |
| `ios` | Xcode 26+ (deployment target iOS 17.0) |
| `flutter` | Flutter 3.44+, plus the Android and iOS prerequisites |
| `react-native`, `react-native-bare` | Node.js 24+, plus the Android and iOS prerequisites |
| `server` | Node.js 24+ |

## Toolchain pins

The samples do not all use the same Kotlin or Gradle version, and the differences
are deliberate. Check this table before "aligning" them: two of the pins below
break the build when raised.

| Where | Pin | Why |
| --- | --- | --- |
| `flutter/android/settings.gradle.kts` | Kotlin 2.4.10, **must be declared** | AGP 9 bundles Kotlin 2.2.10, which is below Flutter's 2.2.20 minimum. Omit `org.jetbrains.kotlin.android` and current Flutter fails the Android build. Same pin lives in the Flutter SDK's `example/android/settings.gradle.kts`. |
| `flutter/android/app/build.gradle.kts` | AGP id written `com.android.applic\u0061tion` | Flutter 3.44 scans this block as text and injects legacy KGP when it sees the literal `com.android.application`, which undoes the pin above. Same escape belongs in the Flutter SDK example. |
| `react-native/android`, `react-native-bare/android` | Gradle **9.3.1**, not 9.6.1 | **Load-bearing.** Gradle 9.6.1 ships kotlin-stdlib 2.3.x, whose metadata React Native's own Gradle plugin (compiled with Kotlin 2.1.0) cannot read. Raising this fails `:gradle-plugin:settings-plugin:compileKotlin`. Follows React Native's toolchain, not Gradle's latest. |
| everything else | Gradle 9.6.1 | Current release. |

## Configure

Each sample reads its `clientId`, `redirectUri` and backend URL from local, gitignored
files. Copy the example and fill in your own values, then generate the per-sample config:

```bash
cp shared/secrets/.env.example shared/secrets/.env
./scripts/sync-secrets.sh
```

`sync-secrets.sh` leaves tracked sources alone by default. It only rewrites tracked files
if you pass `--patch-tracked`; if you do, check `git status` before committing.

## Build and run

```bash
cd android            && ./gradlew :app:assembleDebug
cd ios                && xcodebuild -project demo-krdpass-auth.xcodeproj -scheme demo-krdpass-auth -destination 'generic/platform=iOS Simulator' build
cd flutter            && flutter pub get && flutter analyze
cd react-native       && npm ci && npm run lint && npm run typecheck && npm test
cd react-native-bare  && npm ci && npm run lint && npm run typecheck && npm test
cd server             && npm ci && npm test && npm start
```

The two React Native samples ship no `package-lock.json` between releases, and the bare
sample ships no `ios/Podfile.lock`. Both resolve the SDK from a git tag, so a lock is only
truthful once that tag exists; they are regenerated and committed as part of tagging. Until
then use `npm install` and `bundle exec pod install` rather than `npm ci`.

The sample apps' refresh and revoke flows need `DEMO_UNAUTHENTICATED_TOKEN_ROUTES=true` in
`server/.env` (off by default; see [`server/README.md`](../server/README.md#step-by-step-setup)
for why). It is opt-in on purpose, so set it yourself:

```bash
DEMO_UNAUTHENTICATED_TOKEN_ROUTES=true ./scripts/sync-secrets.sh
```

or set `DEMO_UNAUTHENTICATED_TOKEN_ROUTES=true` in `shared/secrets/.env` and run
`./scripts/sync-secrets.sh` without the override.

`./scripts/run-sample.sh --app <name>` builds and installs a sample on a connected device
or simulator. `--app` takes one of `server`, `android`, `ios`, `flutter`, `react-native`,
`react-native-bare`. The three cross-platform samples also need a `--platform`:

```bash
./scripts/run-sample.sh --app android
./scripts/run-sample.sh --app flutter --platform ios --device "My iPhone"
```

Run `./scripts/run-sample.sh --help` for the rest of the options.

## Building against a local SDK checkout

Each sample resolves its SDK from the published release: Maven Central for the Android
core, tagged GitHub repositories for the iOS core, Flutter and React Native packages. To
test an unreleased SDK change, point the sample at a local clone.

**Android.** Pass the path explicitly:

```bash
./gradlew :app:installDebug -PkrdpassSdkDir=/path/to/krdpass-auth-sdk-android
```

`run-sample.sh` does this for you whenever `krdpass-auth-sdk-android` sits beside this
repository, so a sibling checkout silently takes precedence over Maven Central. Move or
rename it when you need to verify a published artifact.

**Flutter.** Create a gitignored `flutter/pubspec_overrides.yaml`:

```yaml
dependency_overrides:
  krdpass_auth_flutter:
    path: ../../krdpass-auth-sdk-flutter
```

**React Native.** Both RN samples' `metro.config.js` already resolve
`krdpass-auth-react-native` from `../../krdpass-auth-sdk-react-native` when that directory
exists. Same caveat as Android: move it aside to test the published package.

**iOS.** SwiftPM and CocoaPods resolve by git tag, so you have to redirect the repository
URL:

```bash
git -C /path/to/krdpass-auth-sdk-ios tag v1.5.0
git config --global url."file:///path/to/krdpass-auth-sdk-ios".insteadOf \
  https://github.com/ditkrg/krdpass-auth-sdk-ios.git
```

This is a **machine-wide** redirect: every clone of that URL on this machine, including any
local CI, resolves to your working copy until you undo it:

```bash
git config --global --unset-all url."file:///path/to/krdpass-auth-sdk-ios".insteadOf
```

## Do not commit

`.env`, `key.properties`, `config.properties`, private keys, keystores, or local build
output. CI fails the `Repo hygiene` job if any of them appear.
