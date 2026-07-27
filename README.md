# KRDPASS Authentication Demo Apps

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform: Android](https://img.shields.io/badge/Platform-Android-green.svg)](android)
[![Platform: iOS](https://img.shields.io/badge/Platform-iOS-gray.svg)](ios)
[![Platform: Flutter](https://img.shields.io/badge/Platform-Flutter-blue.svg)](flutter)
[![Platform: React Native](https://img.shields.io/badge/Platform-React%20Native-blueviolet.svg)](react-native)
[![Platform: Bare React Native](https://img.shields.io/badge/Platform-Bare%20React%20Native-blueviolet.svg)](react-native-bare)

Runnable **sample apps** for the **KRDPASS** authentication SDKs (Android, iOS, Flutter, and React Native), plus a Node.js backend (BFF) reference. Use them to see app-to-app Sign in with KRDPASS end to end.

> **This repository contains demos only.** Each SDK lives in its own repository
> and is published at v1.3.0; the samples install the SDKs from the published
> artifacts listed below.

---

## SDK repositories

The SDKs themselves are **not** in this repo. Each sample resolves its SDK from:

| Platform | SDK repository | Consumed as |
| :--- | :--- | :--- |
| **Android** (Kotlin) | [`ditkrg/krdpass-auth-sdk-android`](https://github.com/ditkrg/krdpass-auth-sdk-android) | Maven Central: `krd.pass:krdpass-auth:1.3.0` |
| **iOS** (Swift) | [`ditkrg/krdpass-auth-sdk-ios`](https://github.com/ditkrg/krdpass-auth-sdk-ios) | Swift Package Manager: exact `1.3.0` |
| **Flutter** | [`ditkrg/krdpass-auth-sdk-flutter`](https://github.com/ditkrg/krdpass-auth-sdk-flutter) | git dependency: `ref: v1.3.0` |
| **React Native** | [`ditkrg/krdpass-auth-sdk-react-native`](https://github.com/ditkrg/krdpass-auth-sdk-react-native) | git dependency: `#v1.3.0` |

## Sample apps

| Platform | Sample |
| :--- | :--- |
| **Android** | [`android`](android) |
| **iOS** | [`ios`](ios) |
| **Flutter** | [`flutter`](flutter) |
| **React Native (Expo)** | [`react-native`](react-native) |
| **React Native (bare)** | [`react-native-bare`](react-native-bare) |
| **Server** (BFF, Node.js) | [`server`](server) |

Each sample pins its SDK to the published 1.3.0 release. See each sample's
`settings.gradle.kts` / `pubspec.yaml` / `package.json` / Xcode package
reference for the exact dependency declaration.

## Installing the SDK in your own app

Installation instructions live in each SDK repository's README (linked in the table
above). For an end-to-end walkthrough covering backend, onboarding inputs, and per-platform
setup, start with the [Integration Guide](docs/INTEGRATION.md).

## Start here (recommended order)

1. [Documentation Index](docs/README.md)
2. [Integration Guide](docs/INTEGRATION.md)
3. Your platform sample README: [`android`](android), [`ios`](ios), [`flutter`](flutter), [`react-native`](react-native), [`react-native-bare`](react-native-bare)
4. [Server Example](server/README.md) for BFF token exchange reference

## Security & compliance

KRDPASS operates on a trust-based model for accessing citizen data.

- **Credential Issuance**: Access is approval-based. Contact `integration@pass.krd` for onboarding.
- **Server-Side Secrets**: Never embed `client_secret` in your mobile application. Use the Backend-for-Frontend (BFF) pattern.
- **Redirect Validation**: HTTPS origin, encoded path, and registered query
  parameters must match exactly.
- **Single Contract**: CAA bootstrap accepts the v1 envelope: flat top-level
  authorization parameters, a `returnUrl`, and (for native Android callers) a
  `FingerPrint` of `<SHA-256>|<package>`. The structured v2 envelope is a
  proposed, unimplemented contract kept at `shared/contracts/proposed/`.

For a deep dive into our security practices, please read [docs/SECURITY.md](docs/SECURITY.md).

## Documentation

- [Documentation Index](docs/README.md): Recommended reading flow and doc map.
- [Integration Guide](docs/INTEGRATION.md): Quick start for integrating the SDKs.
- [API Reference](docs/specs/sdk-auth-api.md): Detailed API contract specification.
- [Server Example](server/README.md): Reference implementation for backend token exchange.
- [DIT Digital Service Manual](https://docs.digital.gov.krd/software-development/04-interoperability/10-krdpass): Official KRDPASS policy and interoperability guidance.

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for how to propose changes, report issues, or add features.

## License

MIT, see [LICENSE](LICENSE).
