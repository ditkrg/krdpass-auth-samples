# KRDPASS Bare React Native Sample App

Reference bare React Native app for **Sign in with KRDPASS**. Expo-free: it exercises
React Native autolinking and Codegen directly and installs no Expo packages.

## What This Sample Demonstrates

- Server-mediated flow (recommended): backend performs PAR + token exchange
- Client-only flow: the SDK performs PAR + PKCE + token exchange itself
- Both flows are switchable via the in-app Auth Mode toggle
- Scope toggles for `citizen_identity` and `offline_access`
- Token refresh on demand, and automatic refresh at the point of use (`validAccessToken`)
- Token revocation, and a sign-out that revokes the refresh token first
- UserInfo fetch and ID-token signature verification against the CAS JWKS
- Universal Link and App Link callback handling
- Typed error branching, including the `provider_not_installed` install prompt

## Prerequisites

- Node.js 22.11+ (CI builds on 24)
- Android SDK, or Xcode 26+ with CocoaPods via Bundler for iOS
- A running backend that implements the server-mediated PAR + token exchange (see the
  protocol reference under "Related Docs")
- KRDPASS onboarding-approved credentials

## Onboarding

You need a `clientId`, approved scopes and a registered HTTPS `redirectUri` before
this sample can sign in. See the [integration guide](../docs/INTEGRATION.md#onboarding)
for what to send to `integration@pass.krd`.

## Step-by-Step Setup

1. Install dependencies:

```bash
npm install
```

   This sample targets React Native SDK `v1.5.0` and Android core `1.5.0`,
   both installed from the published release.

   No `package-lock.json` or `ios/Podfile.lock` is tracked between releases:
   both are regenerated and committed at release time, so use `npm install` and
   `bundle exec pod install` until then.

2. Configure demo values. The shared local configuration is the only source of
   demo values; do not copy values from another sample or put a client secret in
   this project.

```bash
cd ..
./scripts/sync-secrets.sh --all
```

   That reads `shared/secrets/.env` and writes this project's ignored `.env` with
   `BACKEND_URL`, `REDIRECT_URI`, `CLIENT_ID` and `KRD_ENVIRONMENT`, plus the shared
   Android debug signing key at `android/key.properties`. `config.ts` reads them
   through `react-native-config` and rejects the `.env.example` placeholders, so a
   missing value fails at startup with a config message rather than at a DNS lookup
   later. `KRD_ENVIRONMENT` must be `development` or `production`.

   Tracked native settings (Android package, iOS bundle ID and team, Associated
   Domains) are left alone by default. Pass `--patch-tracked` when you really do
   want them rewritten to your registered demo values, which is what a
   physical-device sign-in test needs.

3. For the server-mediated flow, run the reference backend: see `../server`.

   Set `DEMO_UNAUTHENTICATED_TOKEN_ROUTES=true` in the server's `.env` if you want
   the Refresh and Revoke buttons and the revoke half of Sign Out to work. Those
   routes are off by default and return 404, deliberately: they attach the server's
   `CLIENT_SECRET` to whatever token a caller posts. See `../server/README.md`.

4. Run the app:

```bash
npm run android
# or
(cd ios && bundle install && bundle exec pod install)
npm run ios
```

   Start Metro separately with `npm start` when launching through Xcode.

### Running on a physical device

- **Android**: the app must be signed with the shared registered debug key, or
  KRDPASS rejects the caller. `./scripts/sync-secrets.sh` writes that
  `android/key.properties` for you.
- **iOS**: the configured team, bundle ID, and Associated Domain all have to line
  up, and the AASA file at the redirect host must name `<TeamID>.<bundle-id>`, or
  the callback opens in Safari and never returns to the app.
- **Both**: KRDPASS itself has to be installed, or sign-in fails closed with
  `provider_not_installed`.

## Notes

- Keep `client_secret` and private keys on the backend only.
- The default flow is server-mediated. The in-app direct-flow switch exercises the
  SDK-only PKCE path and should be used only with an approved public client.
- Tokens stay in memory and the app never renders their values.
- Redirect validation requires the exact registered HTTPS origin, encoded path, and
  fixed query parameters.
- BFF token exchange sends only `code`, `codeVerifier`, and `state`; the BFF
  recovers environment and redirect URI from server-side PAR state.
- `npm test` runs the Jest suite, including the shared redirect-validation vectors
  from [`shared/test-vectors`](../shared/test-vectors/redirect-validation.json).

## Related Docs

- React Native SDK README: https://github.com/ditkrg/krdpass-auth-sdk-react-native#readme
- Expo sample: [`../react-native`](../react-native)
- Sign in with KRDPASS protocol & backend reference: https://docs.digital.gov.krd/software-development/04-interoperability/11-krdpass-sign-in-with-krdpass.html
