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
