# Shared Secrets (Local-Only)

This folder is the single source of truth for **local** secrets and sample configuration.

- Everything in `shared/secrets/` is gitignored **except** this README and `.env.example`.
- Put real values in `shared/secrets/.env`.
- Then run the sync script to generate all per-sample config files.

## Setup

1. Create the local secrets file:

```bash
cp shared/secrets/.env.example shared/secrets/.env
```

2. Fill in values in `shared/secrets/.env`.

3. Choose your sync target:

```bash
# All sample apps (default)
./scripts/sync-secrets.sh

# Android-only sample apps
./scripts/sync-secrets-android.sh

# iOS-only sample apps
./scripts/sync-secrets-ios.sh
```

Or run and sync in one step:

```bash
./scripts/run-sample.sh --app flutter --platform android --sync
./scripts/run-sample.sh --app react-native --platform ios --device "My iPhone" --sync
```

## What Gets Generated

Ignored files, written on every run:

- `server/.env` (includes `CLIENT_SECRET` + `RSA_PRIVATE_KEY`)
- `android/config.properties` (Android target only)
- `flutter/.env`
- `react-native/.env` (the `EXPO_PUBLIC_` prefixed keys)
- `react-native-bare/.env`

Android target only, all four pointing at the same signing key:

- `android/key.properties`
- `flutter/android/key.properties`
- `react-native/android/key.properties`
- `react-native-bare/android/key.properties`

Tracked sample project files are left alone by default
(`PATCH_TRACKED_DEMO_FILES=false`, equivalently `--no-patch-tracked`), because
patching them leaves your clone dirty and can stage your own client id.

Opt in with `--patch-tracked` (or `PATCH_TRACKED_DEMO_FILES=true`) to also rewrite:

- Associated domains in the four `.entitlements` files, from `REDIRECT_URI`
- Android sample package IDs from `DEMO_ANDROID_PACKAGE_NAME`, in the Gradle
  files and the `.kt`/`.java` package trees under them
- iOS sample bundle IDs in the four `project.pbxproj` files, from `DEMO_IOS_BUNDLE_ID`
- iOS signing team IDs from `DEMO_IOS_TEAM_ID` (when provided)
- `KRD_CLIENT_ID`, `KRD_BACKEND_URL` and `KRD_REDIRECT_URI` in the iOS sample's
  shared Xcode scheme, which is where that sample reads its config from
- `react-native/app.json` (Expo package, bundle identifier, associated domains)

## Required Values By Target

Common required values (all targets):

- `BACKEND_URL`
- `REDIRECT_URI`
- `CLIENT_ID`
- `CLIENT_SECRET`
- `RSA_PRIVATE_KEY`

Android target (`./scripts/sync-secrets-android.sh`):

- Required: all common values above
- Signing:
  - Either set your own keystore (`ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_ALIAS`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEYSTORE_PRIVATE_KEY_PASSWORD`)
  - Or leave keystore vars unset to use auto-generated shared demo keystore
- Optional:
  - `DEMO_ANDROID_PACKAGE_NAME` (default: `krd.pass.auth.demo`)
  - `DEMO_ANDROID_APP_LINKS`
  - `DEMO_ANDROID_SHA256`

iOS target (`./scripts/sync-secrets-ios.sh`):

- Required: all common values above
- Recommended for real device signing + Universal Links:
  - `DEMO_IOS_BUNDLE_ID`
  - `DEMO_IOS_TEAM_ID` (or `DEMO_IOS_APP_IDS`)

## Android Signing (one key for all Android samples)

By default the sync script creates a shared demo keystore at `shared/secrets/krdpass-demo.keystore` (if missing) and uses it for all Android/Flutter/React Native samples. The Android package name defaults to `krd.pass.auth.demo` and can be overridden with `DEMO_ANDROID_PACKAGE_NAME`. The script prints the SHA256 fingerprint so you can add it to the CAS allow list.

To use your own keystore instead, set in `.env`:

- `ANDROID_KEYSTORE_PATH`
- `ANDROID_KEYSTORE_ALIAS`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEYSTORE_PRIVATE_KEY_PASSWORD`

The script will use that keystore and print its SHA256 for CAS.
