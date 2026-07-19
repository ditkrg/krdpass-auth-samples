# KRDPASS Android Example App

Reference Android app for **Sign in with KRDPASS**.

## What This Example Demonstrates

- Server-mediated flow (recommended): backend performs PAR + token exchange
- Client-only flow: the SDK performs PAR + PKCE + token exchange itself
- PKCE generation and auth handling
- UserInfo and token inspection

## Prerequisites

- A recent Android Studio (AGP 9 requires a 2025-or-newer release)
- JDK 21
- KRDPASS app on device/emulator
- Running backend (recommended: `server`)

## Required Onboarding Inputs

- `clientId`
- HTTPS `redirectUri`
- `backendUrl`
- Approved scopes (including citizen scopes only if approved)
- Android package name + SHA-256 signing fingerprint registered with KRDPASS

## Step-by-Step Setup

1. Open this folder in Android Studio (or use Gradle from the CLI). The KRDPASS SDK
   resolves from Maven Central (`krd.pass:krdpass-auth`), so no token or extra repository
   is needed.

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

3. For the server-mediated flow, run the reference backend: see `../server`.

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
- Use HTTPS redirect URIs.
- For cross-platform deployments, keep `redirectUri` host aligned with the app's registered Universal Link domain.
- Android completes callback through Intent result, but OAuth policy still requires `redirectUri`.

## Related Docs

- Android SDK README: https://github.com/ditkrg/krdpass-auth-sdk-android#readme
- Integration guide: `../docs/INTEGRATION.md`
- Server reference: `../server/README.md`
