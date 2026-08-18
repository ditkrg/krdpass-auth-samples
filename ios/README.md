# KRDPASS iOS Sample App

Reference iOS app for **Sign in with KRDPASS**.

## Prerequisites

- Xcode 26+ (Swift 6.2 toolchain)
- iOS 17.0+ simulator or device (the sample's deployment target)
- A running backend that performs PAR + the token exchange for the server-mediated flow (see the protocol reference under "Related Docs")
- KRDPASS onboarding-approved credentials

## Step-by-Step Setup

1. Open `demo-krdpass-auth.xcodeproj`.
2. Resolve packages: `File > Packages > Resolve Package Versions` (pulls
   `krdpass-auth-sdk-ios` 1.6.0, pinned as an exact version in the project file). If it
   fails, `File > Packages > Reset Package Caches`.
3. Configure run-time variables: `Product > Scheme > Edit Scheme... > Run > Arguments > Environment Variables`:

| Variable | Example |
| --- | --- |
| `KRD_BACKEND_URL` | `https://your-backend.example.com` |
| `KRD_REDIRECT_URI` | `https://your-backend.example.com/_krdpass/oauth/callback` |
| `KRD_CLIENT_ID` | `your-client-id` |
| `KRD_ENVIRONMENT` | `development` |

   The committed scheme ships placeholder values, which the app rejects at launch. Replace
   them with your own onboarding values.
4. Point the Associated Domains entry in `demo-krdpass-auth/demo-krdpass-auth.entitlements`
   at your `KRD_REDIRECT_URI` host (`applinks:<that-host>`). The committed value is a
   placeholder host.
5. For the server-mediated flow, run the reference backend: see `../server`.
6. Build and run: `Product > Run` (Cmd+R).

`./scripts/sync-secrets.sh` from the repository root does steps 3 and 4 for you, plus the
bundle identifier and development team in the project file, from `shared/secrets/.env`.

### What a working sign-in still needs

A build alone does not complete a round trip, on the simulator or on a device:

- **KRDPASS installed on the same simulator or device.** App-to-app SSO launches it via a
  Universal Link; if it is absent, sign-in fails closed with `provider_not_installed`.
- **One consistent Universal-Link host** across the `applinks:` entry, `KRD_REDIRECT_URI`,
  and the host serving the AASA file.
- **A live AASA file** at `https://<that-host>/.well-known/apple-app-site-association` whose
  `appID` is `<TeamID>.<your-bundle-id>`. Without it the callback opens in Safari and never
  returns to the app.

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
   The AASA `appID` has to be updated to match.
4. Satisfy the three prerequisites above, then build + run, complete a sign-in round trip,
   and confirm the callback returns into the app (not Safari).

## Related Docs

- iOS SDK README: https://github.com/ditkrg/krdpass-auth-sdk-ios#readme
- Sign in with KRDPASS protocol & backend reference: https://docs.digital.gov.krd/software-development/04-interoperability/11-krdpass-sign-in-with-krdpass.html
