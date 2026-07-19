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

   The native KRDPASS Android core resolves from Maven Central (`krd.pass:krdpass-auth`),
   so no token or extra repository is needed.

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

4. Optional custom Android signing:

```bash
cp android/key.properties.example android/key.properties
```

If `android/key.properties` is missing, debug builds use default debug signing.

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
- Use HTTPS redirect URI registered during onboarding.
- Android callback returns through Intent result while OAuth policy still requires `redirectUri`.

## Related Docs

- React Native SDK README: https://github.com/ditkrg/krdpass-auth-sdk-react-native#readme
- Sign in with KRDPASS (backend integration reference): https://docs.digital.gov.krd/software-development/04-interoperability/11-krdpass-sign-in-with-krdpass.html
