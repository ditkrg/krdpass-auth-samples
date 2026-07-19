# KRDPASS SDK Integration Guide

This guide explains the technical steps to integrate **Sign in with KRDPASS** using this repository. For comprehensive policy, design guidelines, and trust models, please consult the [Digital Service Manual](https://docs.digital.gov.krd/software-development/04-interoperability/10-krdpass).

## 1. Recommended Architecture

Use **server-mediated OAuth** (BFF pattern):

1. Mobile app requests a PAR `request_uri` from your backend.
2. SDK opens KRDPASS app with `clientId`, `request_uri`, and `redirectUri`.
3. User authenticates in KRDPASS.
4. SDK returns an authorization code.
5. Backend exchanges the code + PKCE verifier for tokens.

Why this is recommended:
- `client_secret` and signing keys stay server-side.
- State and redirect validation stay under backend control.
- Operational logging and incident response are simpler.

## 2. Credential Issuance and Policies

For detailed policy requirements, credential issuance, and trust models, please refer to the [KRDPASS section in the DIT Digital Service Manual](https://docs.digital.gov.krd/software-development/04-interoperability/10-krdpass).

**Key Points:**
- **Approval Based**: Integration access is granted per use case.
- **Contact**: `integration@pass.krd` for onboarding.

## 3. Platform Callback Model

- **iOS**: Universal Links (`https://`) callback handling.
- **Android**: callback is returned via Activity/Intent result.
- **React Native**: uses the same native behavior under Expo/Bare RN integration.

Important:
- Use a `redirectUri` host that is registered as your app's Universal Link domain for iOS (Associated Domains).
- Android still requires a configured `redirectUri` because OAuth server policy requires it.

## 4. Onboarding Data You Need to Prepare

Before integration, prepare and submit:

- OAuth details: `clientId`, approved scopes, environment (`development` / `production`)
- Redirect URI: exact HTTPS callback URI on your app's Universal Link host
- Android: package name + SHA-256 signing fingerprint
- iOS: bundle identifier + team identifier + associated domain host
- Backend endpoints and allowed origins for your mobile app

## 5. Install the SDK (v1)

The Android core ships on Maven Central; the iOS, Flutter, and React Native SDKs are
consumed from their GitHub repositories via git tags. Each SDK repository's README carries
the platform-specific steps:

- Flutter: [ditkrg/krdpass-auth-sdk-flutter](https://github.com/ditkrg/krdpass-auth-sdk-flutter), pubspec git dependency (`ref: v1.0.0`)
- Android: [ditkrg/krdpass-auth-sdk-android](https://github.com/ditkrg/krdpass-auth-sdk-android), Maven Central, `krd.pass:krdpass-auth:1.0.0` (resolves with `mavenCentral()`, no token)
- iOS: [ditkrg/krdpass-auth-sdk-ios](https://github.com/ditkrg/krdpass-auth-sdk-ios), SwiftPM / CocoaPods git tag `v1.0.0`
- React Native: [ditkrg/krdpass-auth-sdk-react-native](https://github.com/ditkrg/krdpass-auth-sdk-react-native), npm git dependency (`#v1.0.0`)

For advanced integration details and protocol specifications, refer to [specs/sdk-auth-api.md](specs/sdk-auth-api.md).

## 6. Backend Reference

Reference server: `../server`

It demonstrates:
- PAR request handling
- Token exchange
- Optional refresh/revoke endpoints
- State validation and redirect checks

## 7. Integration Checklist

1. Obtain onboarding-approved `clientId` and `clientSecret`.
2. Register your HTTPS redirect URI.
3. Register iOS/Android app identity metadata (bundle/package/fingerprint/domain).
4. Implement backend PAR + token exchange endpoints.
5. Configure SDK with `clientId`, `redirectUri`, and environment.
6. Handle all auth outcomes (`success`, `cancelled`, `timeout`, `error`).
7. Validate `state` and redirect values on backend.
8. Keep secrets and refresh flows backend-controlled.

## 8. Scope and Token Notes

- Baseline scopes are `openid profile`.
- Additional citizen scopes require onboarding approval.
- Refresh support exists in SDKs/server, but refresh issuance is generally restricted by default for first integrations.

## 9. Support

- Integration support: `integration@pass.krd`
- Security reports: `security@pass.krd`
- Issues: [https://github.com/ditkrg/krdpass-auth-samples/issues](https://github.com/ditkrg/krdpass-auth-samples/issues)
