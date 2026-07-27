# KRDPASS SDK Integration Guide

This guide explains the technical steps to integrate **Sign in with KRDPASS** using this repository. For comprehensive policy, design guidelines, and trust models, please consult the [Digital Service Manual](https://docs.digital.gov.krd/software-development/04-interoperability/10-krdpass).

## 1. Recommended Architecture

Use **server-mediated OAuth** (BFF pattern):

1. Mobile app requests a PAR `request_uri` from your backend.
2. SDK opens KRDPASS app with `clientId`, `request_uri`, and `redirectUri`.
3. User authenticates in KRDPASS.
4. SDK returns an authorization code.
5. Mobile sends only `code`, `codeVerifier`, and `state` to the BFF. The BFF
   restores the trusted environment and exact redirect URI from its PAR state
   before exchanging the code.

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
- **Android**: native app-to-app sign-in is launched for an Activity Result;
  the callback is returned through that result relationship.
- **React Native**: uses the same native behavior under Expo/Bare RN integration.

Important:
- Use a `redirectUri` host that is registered as your app's Universal Link domain for iOS (Associated Domains).
- Android still requires a configured `redirectUri` because OAuth server policy requires it.
- Android caller identity is derived by KRDPASS from the OS result relationship
  (package name and signing certificate). Do not treat intent extras, referrers,
  URLs, or JavaScript values as caller identity.
- Browser/web launches are a separate client transport; they cannot borrow the
  Android Activity-result proof of a native app.

## 4. Onboarding Data You Need to Prepare

Before integration, prepare and submit:

- OAuth details: `clientId`, approved scopes, environment (`development` / `production`)
- Redirect URI: exact HTTPS callback URI on your app's Universal Link host
- Android: package name + SHA-256 signing fingerprint
- iOS: bundle identifier + team identifier + associated domain host
- Backend endpoints and allowed origins for your mobile app

## 5. Install the SDK (auth v2 release set)

The Android core ships on Maven Central; the iOS, Flutter, and React Native SDKs are
consumed from their GitHub repositories via git tags. Each SDK repository's README carries
the platform-specific steps:

- Flutter: [ditkrg/krdpass-auth-sdk-flutter](https://github.com/ditkrg/krdpass-auth-sdk-flutter), pubspec git dependency (`ref: v1.3.0`)
- Android: [ditkrg/krdpass-auth-sdk-android](https://github.com/ditkrg/krdpass-auth-sdk-android), Maven Central, `krd.pass:krdpass-auth:1.3.0`
- iOS: [ditkrg/krdpass-auth-sdk-ios](https://github.com/ditkrg/krdpass-auth-sdk-ios), SwiftPM / CocoaPods git tag `v1.3.0`
- React Native: [ditkrg/krdpass-auth-sdk-react-native](https://github.com/ditkrg/krdpass-auth-sdk-react-native), npm git dependency (`#v1.3.0`)

Every sample depends on a published git tag, so a clean clone installs without
any local checkout. To develop against a local SDK clone, use the gitignored
override documented beside each sample rather than editing the manifest.

For advanced integration details and protocol specifications, refer to [specs/sdk-auth-api.md](specs/sdk-auth-api.md).

## 6. Backend Reference

Reference server: `../server`

It demonstrates:
- PAR request handling
- Token exchange
- Optional refresh/revoke endpoints
- State validation and redirect checks

The public BFF token-exchange request is defined by
[`bff-token-exchange-request.schema.json`](../shared/contracts/bff-token-exchange-request.schema.json).
Clients send exactly `code`, `codeVerifier`, and `state`; `environment` and
`redirectUri` are server-owned PAR state and are not accepted from the app.

## 7. Integration Checklist

1. Obtain onboarding-approved `clientId` and `clientSecret`.
2. Register your HTTPS redirect URI.
3. Register iOS/Android app identity metadata (bundle/package/fingerprint/domain).
4. Implement backend PAR + token exchange endpoints.
5. Configure SDK with `clientId`, `redirectUri`, and environment.
6. Handle all auth outcomes (`success`, `cancelled`, `timeout`, `error`).
7. Validate `state` and redirect values on backend.
8. Keep secrets and refresh flows backend-controlled.

## 8. Native-provider Security Test Scenarios

Run these scenarios against a test client registration before a coordinated SDK
release:

1. Install two Android apps. Register only app A's package and signing
   certificate for a native client, then attempt the same request from app B.
   KRDPASS must reject B; changing an intent extra or referrer must not change
   that outcome.
2. Start an app A native Activity-result request, then deliver a second
   `singleTop` intent with a different request. The original caller context must
   remain immutable and the second request must not reach the provider flow.
3. Return a same-host, different-path redirect and a redirect with modified
   fixed query parameters. Both must be rejected. Run the shared
   [redirect vectors](../shared/test-vectors/redirect-validation.json) in every
   SDK repository.
4. Attempt a browser/web launch with no Android result relationship. It must be
   evaluated under the browser-client registration and must not fall back to a
   native client registration.

Auth v2 requires exact redirect HTTPS origin, encoded path, and
registered-query validation.

CAA bootstrap uses the v1 envelope: flat authorization parameters, a
`returnUrl`, and an optional `FingerPrint` of `<SHA-256>|<package>` for native
Android callers. See
[the protocol specification](specs/sdk-auth-api.md#caa-bootstrap-contract).

## 9. Scope and Token Notes

- Baseline scopes are `openid profile`.
- Additional citizen scopes require onboarding approval.
- Refresh support exists in SDKs/server, but refresh issuance is generally restricted by default for first integrations.

## 10. Support

- Integration support: `integration@pass.krd`
- Security reports: `security@pass.krd`
- Issues: [https://github.com/ditkrg/krdpass-auth-samples/issues](https://github.com/ditkrg/krdpass-auth-samples/issues)
