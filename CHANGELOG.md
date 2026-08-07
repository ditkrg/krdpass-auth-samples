# Changelog

## [1.4.0] - 2026-08-07

- All samples now target SDK 1.4.0.
- The Node.js BFF gained a `DEMO_UNAUTHENTICATED_TOKEN_ROUTES` opt-in flag: `/oauth/token/refresh` and `/oauth/token/revoke` are registered only when it is set to `true`, and return a plain 404 otherwise.
- Added a PAR request JSON schema under `shared/contracts/`.

## [1.3.0] - 2026-07-29

Initial public release.

- Five runnable samples: Android (Kotlin/Compose), iOS (Swift/SwiftUI), Flutter, React
  Native with Expo, and bare React Native.
- A Node.js backend-for-frontend reference that performs PAR and the token exchange, for
  the server-mediated flow.
- Shared redirect-validation test vectors and request schemas that the SDK repositories
  validate against.
