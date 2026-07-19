# KRDPASS Flutter Example App

Reference Flutter app for **Sign in with KRDPASS**.

## What This Example Demonstrates

- Server-mediated flow (recommended): backend performs PAR + token exchange
- Client-only flow: the SDK performs PAR + PKCE + token exchange itself
- PAR + PKCE integration
- iOS Universal Link and Android Intent callback behavior

## Prerequisites

- Flutter stable SDK
- KRDPASS app on test device/emulator
- A publicly reachable HTTPS URL for the callback
- A running backend that performs PAR + token exchange (see the integration guide linked below)

## Required Onboarding Inputs

- `CLIENT_ID`
- `REDIRECT_URI` (HTTPS)
- `BACKEND_URL`
- `ENVIRONMENT` (`development` or `production`)
- iOS associated domain and Android app identity metadata registered with KRDPASS

## Step-by-Step Setup

1. Install dependencies:

```bash
flutter pub get
```

   The native KRDPASS Android core resolves from Maven Central (`krd.pass:krdpass-auth`),
   so no token or extra repository is needed.

2. Create local `.env` from template (required: `pubspec.yaml` bundles `.env` as an asset,
   so the build fails without it):

```bash
cp env.example .env
```

   Edit `.env` values:

```env
CLIENT_ID=your-client-id
REDIRECT_URI=https://your-backend.example.com/_krdpass/oauth/callback
BACKEND_URL=https://api.your-backend.example.com
ENVIRONMENT=development
```

3. For the server-mediated flow, stand up a backend that implements PAR + token exchange
   (see `../server` and the integration guide in Related Docs). Point `BACKEND_URL` at it.

4. Android signing (required for sign-in to succeed):

```bash
cp android/key.properties.example android/key.properties   # then point it at the registered keystore
```

KRDPASS validates the calling app's signing certificate, so this app must be signed
with a keystore whose SHA-256 fingerprint is registered against the client. If
`android/key.properties` is missing the build uses the default debug keystore, which is
**not** registered, so sign-in then fails with `invalid_client`.

5. iOS: set the Associated Domains host in `ios/Runner/Runner.entitlements`
   (`applinks:<your-app-universal-link-host>`) to match your `REDIRECT_URI` host.

6. Run the Flutter example:

```bash
flutter run
```

## Notes

- Keep `client_secret` and private keys on backend only.
- Use your app's Universal Link host for `REDIRECT_URI` (iOS Associated Domains).
- Keep the redirect URI HTTPS and exactly matched to onboarding registration.

## Related Docs

- Flutter SDK README: [krdpass-auth-sdk-flutter](https://github.com/ditkrg/krdpass-auth-sdk-flutter#readme)
- Integration guide: <https://docs.digital.gov.krd/software-development/04-interoperability/11-krdpass-sign-in-with-krdpass.html>
