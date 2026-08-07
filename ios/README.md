# KRDPASS iOS Example App

Reference iOS app for **Sign in with KRDPASS**.

## What This Example Demonstrates

- Server-mediated flow (recommended): backend performs PAR + token exchange
- Client-only flow: the SDK performs PAR + PKCE + token exchange itself
- Both flows are switchable via the in-app Auth Mode toggle
- Token refresh, token revocation, and userinfo fetch (in both modes)
- Universal Link callback handling
- PKCE and backend token exchange pattern

## Prerequisites

- Xcode 26+ (Swift 6.2 toolchain)
- iOS 17.0+ simulator or device (the sample's deployment target)
- A running backend that performs PAR + the token exchange for the server-mediated flow (see the protocol reference under "Related Docs")
- KRDPASS onboarding-approved credentials

## Onboarding

You need a `clientId`, approved scopes and a registered HTTPS `redirectUri` before
this sample can sign in. See the [integration guide](../docs/INTEGRATION.md#onboarding)
for what to send to `integration@pass.krd`.

## Step-by-Step Setup

1. Open `demo-krdpass-auth.xcodeproj`.
2. Resolve packages: `File > Packages > Resolve Package Versions` (pulls
   `krdpass-auth-sdk-ios` at its tag). If it fails, `File > Packages > Reset Package Caches`.
3. Configure run-time variables: `Product > Scheme > Edit Scheme... > Run > Arguments > Environment Variables`:

| Variable | Example |
| --- | --- |
| `KRD_BACKEND_URL` | `https://api.your-backend.example.com` |
| `KRD_REDIRECT_URI` | `https://your-backend.example.com/_krdpass/oauth/callback` |
| `KRD_CLIENT_ID` | `your-client-id` |
| `KRD_ENVIRONMENT` | `development` |

   The committed scheme ships placeholder values. Replace them with your own onboarding
   values for your environment.
4. For the server-mediated flow, run the reference backend: see `../server`.
5. Build and run on a simulator: `Product > Run` (Cmd+R). A simulator build works with no
   extra setup.

### Running on a physical device

To run on a real iPhone:

1. **Signing**: in `target demo-krdpass-auth > Signing & Capabilities`, select your
   Apple Developer **Team** (the committed `DEVELOPMENT_TEAM` is intentionally empty;
   a device build fails with "requires a development team" until you set it).
2. **Bundle identifier**: `krd.pass.auth.demo` is in a namespace you likely don't own.
   Either register that App ID under your team, or change `PRODUCT_BUNDLE_IDENTIFIER`
   to one in your namespace.
3. **Re-register with KRDPASS**: if you change the bundle id, re-register the new
   **bundle identifier + Team ID** with your KRDPASS CAS client (the iOS onboarding inputs).
4. **One consistent Universal-Link host**: the `applinks:` host in
   `demo-krdpass-auth.entitlements`, the `KRD_REDIRECT_URI` host, and the host that
   serves the AASA file must all be the **same** real host.
5. **Serve the AASA**: host a valid `/.well-known/apple-app-site-association` at
   `https://<that-host>` whose `appID` is `<TeamID>.<your-bundle-id>`, or the callback
   opens in Safari and sign-in never returns to the app.
6. **Install KRDPASS** on the device: app-to-app SSO launches it via Universal Links;
   if it's absent, sign-in fails closed with `provider_not_installed`.
7. Build + run, complete a sign-in round trip, and confirm the callback returns into
   the app (not Safari).

## Notes

- Keep `client_secret` and private keys on backend only.
- Use HTTPS redirect URI that exactly matches onboarding registration.

## Related Docs

- iOS SDK README: https://github.com/ditkrg/krdpass-auth-sdk-ios#readme
- Sign in with KRDPASS protocol & backend reference: https://docs.digital.gov.krd/software-development/04-interoperability/11-krdpass-sign-in-with-krdpass.html
