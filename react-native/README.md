# KRDPASS React Native Sample App

Reference Expo app for **Sign in with KRDPASS**. The SDK package supports both Expo and bare React Native apps.

## Prerequisites

- Node.js 22.11+ (CI builds on 24)
- Expo CLI tooling
- iOS/Android native toolchains for `expo run:*`
- A running backend that implements the server-mediated PAR + token exchange (see [Sign in with KRDPASS](https://docs.digital.gov.krd/software-development/04-interoperability/11-krdpass-sign-in-with-krdpass.html))

This sample intentionally commits and maintains its Android native project;
the iOS project is generated locally by Expo prebuild. Expo Doctor's app-config
synchronization check is therefore disabled in `package.json`; other Doctor
checks remain enabled.

See [`docs/BUILDING.md`](../docs/BUILDING.md#toolchain-pins) for toolchain pins.

## Step-by-Step Setup

1. Install dependencies:

```bash
npm install
```

   This sample targets React Native SDK `v1.5.0` and Android core `1.5.0`,
   both installed from the published release.

   No `package-lock.json` is tracked between releases: the lockfile is
   regenerated and committed at release time, so use `npm install` until then.

2. Configure demo values from template:

```bash
cp .env.example .env
```

Set values in `.env`:

```ini
EXPO_PUBLIC_BACKEND_URL=https://your-backend.example.com
EXPO_PUBLIC_REDIRECT_URI=https://your-backend.example.com/_krdpass/oauth/callback
EXPO_PUBLIC_CLIENT_ID=your-client-id
EXPO_PUBLIC_KRD_ENVIRONMENT=development
```

These values are read by `config.ts`. It rejects the placeholder values above, so
the app fails at startup with a config message rather than at a DNS lookup later.
`EXPO_PUBLIC_KRD_ENVIRONMENT` must be `development` or `production`; anything else
throws.

3. For the server-mediated flow, run the reference backend: see `../server`.

   Set `DEMO_UNAUTHENTICATED_TOKEN_ROUTES=true` in the server's `.env` if you want
   the Refresh and Revoke buttons and the revoke half of Sign Out to work. Those
   routes are off by default and return 404, deliberately: they attach the server's
   `CLIENT_SECRET` to whatever token a caller posts. See `../server/README.md`.

4. Android signing (required for sign-in to succeed): copy
   [`android/key.properties.example`](android/key.properties.example) to
   `android/key.properties` and point it at your registered keystore
   (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`).

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

- Set `EXPO_PUBLIC_REDIRECT_URI` to your app's Universal Link host (not a generic backend placeholder).
- Android callback returns through Intent result while OAuth policy still requires `redirectUri`.
- `npm test` runs the shared redirect-validation vectors from
  [`shared/test-vectors`](../shared/test-vectors/redirect-validation.json) on the
  `node:test` runner. It needs no test framework because it exercises no React
  Native surface.

## Related Docs

- React Native SDK README: https://github.com/ditkrg/krdpass-auth-sdk-react-native#readme
- Bare React Native sample: [`../react-native-bare`](../react-native-bare)
- Sign in with KRDPASS (backend integration reference): https://docs.digital.gov.krd/software-development/04-interoperability/11-krdpass-sign-in-with-krdpass.html
- Toolchain pins: [`../docs/BUILDING.md`](../docs/BUILDING.md#toolchain-pins)
