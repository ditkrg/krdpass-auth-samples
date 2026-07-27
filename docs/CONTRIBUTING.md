# Contributing to the KRDPASS Auth Samples

Thanks for contributing.

## Repository Layout

```text
android/         Android sample app (Kotlin, Jetpack Compose)
ios/             iOS sample app (Swift, SwiftUI)
flutter/         Flutter sample app
react-native/    React Native (Expo) sample app
server/          Node.js backend (BFF) reference
docs/            Integration guide, security policy, API spec
```

## Prerequisites

- Flutter SDK (for Flutter package and example)
- JDK 17+ (Android libraries use Gradle; example app uses JDK 21 toolchain)
- Android Studio
- Xcode 15+ and CocoaPods (iOS)
- Node.js 18+ and npm (React Native and server example)

## Building Against a Local SDK Checkout

Each sample resolves its SDK from the published release: Maven Central for the
Android core, and the tagged GitHub repository for the iOS core, Flutter and
React Native packages. To try an unreleased SDK change, point the sample at a
local clone instead.

**Android** is automatic when `krdpass-auth-sdk-android` sits beside this
repository; otherwise set `ORG_GRADLE_PROJECT_krdpassSdkDir`, or pass the path
directly to Gradle:

```bash
./gradlew :app:installDebug -PkrdpassSdkDir=/path/to/krdpass-auth-sdk-android
```

**Flutter** uses a gitignored `flutter/pubspec_overrides.yaml`:

```yaml
dependency_overrides:
  krdpass_auth_flutter:
    path: ../../krdpass-auth-sdk-flutter
```

**iOS and React Native** resolve by git tag through SPM and CocoaPods, so
redirect the repository URL to a local clone that carries a matching tag:

```bash
git -C /path/to/krdpass-auth-sdk-ios tag v1.3.0
git config --global url."file:///path/to/krdpass-auth-sdk-ios".insteadOf \
  https://github.com/ditkrg/krdpass-auth-sdk-ios.git
```

Undo it with `git config --global --unset-all url."file:///path/to/krdpass-auth-sdk-ios".insteadOf`
once you are done, or later builds will keep using the local clone.

## Local Validation Commands

Run checks only in the samples you changed. (SDK changes belong in the SDK repositories,
which carry their own test suites and contribution guidelines.)

### Android sample

```bash
cd android
./gradlew :app:assembleDebug
```

### iOS sample

```bash
cd ios
xcodebuild -project demo-krdpass-auth.xcodeproj -scheme demo-krdpass-auth -destination 'generic/platform=iOS Simulator' build
```

### Flutter sample

```bash
cd flutter
flutter pub get
flutter analyze
```

### React Native sample

```bash
cd react-native
npm install
npx tsc --noEmit
```

### Server reference

```bash
cd server
npm install
npm start
```

## Pull Request Guidelines

1. Keep changes scoped and explain why they are needed.
2. Include tests or validation steps for behavior changes.
3. Update relevant docs (`../README.md`, package README, example README, `docs/INTEGRATION.md`).
4. Do not commit secrets, private keys, `.env`, or local build artifacts.
5. Follow release controls in `../.github/RELEASE_GOVERNANCE.md`.
