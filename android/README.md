# KRDPASS Android Sample App

Reference Android app for **Sign in with KRDPASS**.

## What This Sample Demonstrates

- Server-mediated flow (recommended): backend performs PAR + token exchange
- Client-only flow: the SDK performs PAR + PKCE + token exchange itself
- PKCE generation and auth handling
- UserInfo and token inspection

## Prerequisites

- A recent Android Studio (AGP 9 requires a 2025-or-newer release)
- JDK 21
- KRDPASS app on device/emulator
- Running backend (recommended: `server`)

## Onboarding

You need a `clientId`, approved scopes and a registered HTTPS `redirectUri` before
this sample can sign in. See the [integration guide](../docs/INTEGRATION.md#onboarding)
for what to send to `integration@pass.krd`.

## Step-by-Step Setup

1. Open this folder in Android Studio (or use Gradle from the CLI). The sample
   resolves `krd.pass:krdpass-auth:1.5.0` from Maven Central (pinned in
   `gradle/libs.versions.toml`). To build against a local SDK clone instead, use
   the Gradle composite-build override in `settings.gradle.kts`.

2. From this folder, create config file:

```bash
cp config.properties.example config.properties
```

   Edit `config.properties`:

```properties
backendUrl=https://your-backend.example.com
redirectUri=https://your-backend.example.com/_krdpass/oauth/callback
clientId=your-client-id
environment=development
```

   `environment` must be `development` or `production`; anything else fails the build,
   as does leaving the `your-...example.com` placeholders in place.

3. For the server-mediated flow, run the reference backend: see `../server`.

   The app sets `usesCleartextTraffic="false"`, so a plain `http://10.0.2.2:3000`
   backend URL is blocked by the platform before the request leaves the app. Put the
   local backend behind HTTPS instead: an HTTPS dev tunnel is the shortest route, and
   `adb reverse tcp:3000 tcp:3000` lets a device reach a host-side listener once it
   serves HTTPS. Leave the flag off. A demo that ships cleartext is the wrong thing
   to copy into a production app.

4. Signing (required for sign-in to succeed):

```bash
cp key.properties.example key.properties   # then point it at the registered keystore
```

KRDPASS validates the calling app's signing certificate, so this app must be signed
with a keystore whose SHA-256 fingerprint is registered against the client. If
`key.properties` is missing the build uses the default debug keystore, which is **not**
registered, so sign-in then fails with `invalid_client`. See `key.properties.example`.

5. Run from Android Studio or Gradle:

```bash
./gradlew :app:assembleDebug
```

## Notes

- Keep `client_secret` on backend only.
- Use the exact registered HTTPS redirect URI. Same-host alternate paths or
  modified fixed query parameters are rejected.
- For cross-platform deployments, keep `redirectUri` host aligned with the app's registered Universal Link domain.
- Android completes callback through Intent result, but OAuth policy still requires `redirectUri`.
- BFF token exchange sends only `code`, `codeVerifier`, and `state`; the BFF
  recovers environment and redirect URI from server-side PAR state.

## Related Docs

- Android SDK README: https://github.com/ditkrg/krdpass-auth-sdk-android#readme
- Integration guide: `../docs/INTEGRATION.md`
- Server reference: `../server/README.md`
