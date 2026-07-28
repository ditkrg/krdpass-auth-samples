# KRDPASS React Native Example App

Reference Expo app for **Sign in with KRDPASS**. The SDK package supports both Expo and bare React Native apps.

## What This Example Demonstrates

- Server-mediated flow (recommended): backend performs PAR + token exchange
- Client-only flow: the SDK performs PAR + PKCE + token exchange itself
- Citizen identity retrieval
- Token verification
- Refresh and revoke endpoints (when approved)

## Prerequisites

- Node.js 20+
- Expo CLI tooling
- iOS/Android native toolchains for `expo run:*`
- A running backend that implements the server-mediated PAR + token exchange (see [Sign in with KRDPASS](https://docs.digital.gov.krd/software-development/04-interoperability/11-krdpass-sign-in-with-krdpass.html))

This example intentionally commits and maintains its Android native project;
the iOS project is generated locally by Expo prebuild. Expo Doctor's app-config
synchronization check is therefore disabled in `package.json`; other Doctor
checks remain enabled.

The dependency versions follow Expo SDK 57's exact supported matrix. React,
React Native, and Expo packages must move together during an SDK upgrade;
`npm run doctor` verifies that alignment.

## Required Onboarding Inputs

- `CLIENT_ID`
- HTTPS `REDIRECT_URI`
- `BACKEND_URL`
- Approved scopes (include `offline_access` only when approved)
- iOS associated domain host
- Android package name + signing SHA-256 fingerprint

## Step-by-Step Setup

1. Install dependencies:

```bash
npm install
```

   This sample targets React Native SDK `v1.3.0` and Android core `1.3.0`,
   both installed from the published release.

2. Configure demo values from template:

```bash
cp .env.example .env
```

Set values in `.env`:

```ini
EXPO_PUBLIC_BACKEND_URL=https://your-backend.example.com
EXPO_PUBLIC_REDIRECT_URI=https://your-backend.example.com/_krdpass/oauth/callback
EXPO_PUBLIC_CLIENT_ID=your-client-id
EXPO_PUBLIC_ENVIRONMENT=development
```

These values are read by `config.ts`.

3. For the server-mediated flow, run the reference backend: see `../server`.

4. Android signing (required for sign-in to succeed): create
   `android/key.properties` pointing at your registered keystore.

   KRDPASS validates the calling app's signing certificate, so this app must be signed
   with a keystore whose SHA-256 fingerprint is registered against the client. If
   `key.properties` is missing the build uses the default debug keystore, which is **not**
   registered, so sign-in then fails with `invalid_client`.

5. Configure iOS Universal Link host in `app.json`:
- `expo.ios.associatedDomains` should include `applinks:<your-app-universal-link-host>`.

6. Run app:

```bash
npx expo run:android
# or
npx expo run:ios
```

For iOS physical devices, start Metro for dev-client in a separate terminal:

```bash
npx expo start --dev-client --tunnel
```

## Notes

- Keep `client_secret` and private keys on backend only.
- Set `EXPO_PUBLIC_REDIRECT_URI` to your app's Universal Link host (not a generic backend placeholder).
- Use the exact HTTPS origin, encoded path, and fixed query parameters
  registered during onboarding.
- Android callback returns through Intent result while OAuth policy still requires `redirectUri`.
- BFF token exchange sends only `code`, `codeVerifier`, and `state`; the BFF
  recovers environment and redirect URI from server-side PAR state.

## Related Docs

- React Native SDK README: https://github.com/ditkrg/krdpass-auth-sdk-react-native#readme
- Sign in with KRDPASS (backend integration reference): https://docs.digital.gov.krd/software-development/04-interoperability/11-krdpass-sign-in-with-krdpass.html
