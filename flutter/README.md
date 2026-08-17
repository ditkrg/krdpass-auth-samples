# KRDPASS Flutter Sample App

Reference Flutter app for **Sign in with KRDPASS**.

## Prerequisites

- Flutter 3.44 or newer
- KRDPASS app on test device/emulator
- A publicly reachable HTTPS URL for the callback
- A running backend that performs PAR + token exchange (see the integration guide linked below)

## Step-by-Step Setup

1. Install dependencies:

```bash
flutter pub get
```

   This sample targets Flutter SDK `v1.5.0` and Android core `1.5.0`, both
   resolved from the published release.

2. Create local `.env` from template (required: `pubspec.yaml` bundles `.env` as an asset,
   so the build fails without it):

```bash
cp env.example .env
```

   Edit `.env` values:

```env
CLIENT_ID=your-client-id
REDIRECT_URI=https://your-backend.example.com/_krdpass/oauth/callback
BACKEND_URL=https://your-backend.example.com
KRD_ENVIRONMENT=development
```

   The app rejects the `your-...example.com` placeholders at startup, and
   `KRD_ENVIRONMENT` must be `development` or `production` if set.

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

6. Run the Flutter sample:

```bash
flutter run
```

## Notes

- `.env` is declared as a Flutter asset in `pubspec.yaml`, which means it is
  copied verbatim into the APK and the IPA and can be extracted from either.
  Everything in it is public by construction: a client id, a redirect URI, a
  backend URL. Nothing that has to stay secret can live there.
- Use your app's Universal Link host for `REDIRECT_URI` (iOS Associated Domains).

## Related Docs

- Flutter SDK README: [krdpass-auth-sdk-flutter](https://github.com/ditkrg/krdpass-auth-sdk-flutter#readme)
- Integration guide: <https://docs.digital.gov.krd/software-development/04-interoperability/11-krdpass-sign-in-with-krdpass.html>
- Toolchain pins: [`../docs/BUILDING.md`](../docs/BUILDING.md#toolchain-pins)
