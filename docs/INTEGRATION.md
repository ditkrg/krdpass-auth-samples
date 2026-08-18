# Integration guide

How Sign in with KRDPASS fits together, and what you have to build. Per-platform install
and API details live in each SDK's README; this page is the part that is the same
everywhere.

## Pick a flow

**Server-mediated (recommended for production).** Your backend holds the client secret and
runs the OAuth exchange. PKCE and `state` stay in your app:

1. Your app calls the SDK's `generatePkcePair()` and `generateState()`.
2. Your app asks your backend for a PAR `request_uri`. Only `codeChallenge`, `environment`
   and `redirectUri` are required. `codeChallengeMethod` (`S256` is the only accepted
   value, and the default), `state`, `nonce` and `scope` are optional: `../server`
   generates a `state` and a `nonce` when they are absent and falls back to its own
   default scope, which must include `openid`. Send your own `state` anyway, as every
   sample here does, so the value your app verifies is the one it generated. The
   `codeVerifier` stays in the app. The full request and response bodies are in
   [Reference: Endpoint Contracts](https://docs.digital.gov.krd/software-development/04-interoperability/15-krdpass-reference.html#endpoint-contracts)
   and the [PAR request schema](../shared/contracts/bff-par-request.schema.json).
3. Your app calls the SDK's `authenticate` with that `request_uri` and the `state` the
   response returned, falling back to the one your app generated if the response omits it.
4. The SDK launches KRDPASS. The user authenticates there.
5. The SDK returns an authorization code to your app.
6. Your app sends only `code`, `codeVerifier` and `state` to your backend, which exchanges
   them for tokens.

The backend restores the environment and the exact redirect URI from its own PAR state, so
a compromised app cannot influence either. `../server` is a working reference.

**Client-only.** The SDK runs PKCE, PAR and the token exchange itself and hands your app
tokens. There is no client secret, and nowhere to hide one, so the client is public. Use it
for prototypes and for apps with no backend. It needs a public client, which is not
currently issued for any integration, so use the server-mediated flow.

Both flows use PKCE and a `state` that fails closed. Neither uses a browser or WebView.

## What the platform callback looks like

| Platform | Launch | Callback |
| --- | --- | --- |
| Android | Explicit intent to the KRDPASS package | Activity result |
| iOS | Universal Link | Universal Link back to your `redirectUri` host |
| Flutter, React Native | Whichever native core is running | Same as above |

Two consequences worth knowing before you start:

- On iOS, your `redirectUri` host must be an Associated Domain of your app and must serve a
  valid `apple-app-site-association`. Without it the flow launches and never returns.
- On Android, KRDPASS derives your app's identity from the OS: the calling package and its
  signing certificate. Intent extras, referrers and URLs are caller-controlled and are
  never treated as identity. This is why every signing certificate you ship from has to be
  registered.

## Onboarding

Email `integration@pass.krd`. Access is approval-based and granted per use case.

Prepare:

- The scopes you need. `openid profile` is the baseline; citizen-identity scopes need
  separate approval.
- Your exact HTTPS redirect URI.
- Android: package name and the SHA-256 fingerprint of every signing certificate you ship
  from, including debug and Play App Signing.
- iOS: bundle identifier, Apple Team ID, and the associated domain host.
- Your backend's token-exchange endpoint, if you are using the server-mediated flow.

You get back a `clientId`, plus a `clientSecret` for your backend if you are
server-mediated. Refresh-token issuance is restricted by default for new integrations; ask
if you need it.

## Install

Each SDK README has the platform steps. The coordinates:

| Platform | Installed as |
| --- | --- |
| [Android](https://github.com/ditkrg/krdpass-auth-sdk-android) | Maven Central `krd.pass:krdpass-auth:1.6.0` |
| [iOS](https://github.com/ditkrg/krdpass-auth-sdk-ios) | SwiftPM or CocoaPods, git tag `v1.6.0` |
| [Flutter](https://github.com/ditkrg/krdpass-auth-sdk-flutter) | pubspec git dependency, `ref: v1.6.0` |
| [React Native](https://github.com/ditkrg/krdpass-auth-sdk-react-native) | npm git dependency, `#v1.6.0` |

Every sample here depends on a published tag, so a clean clone installs with no local
checkout.

## The backend contract

Your app sends the BFF exactly `code`, `codeVerifier` and `state`, defined by
[`bff-token-exchange-request.schema.json`](../shared/contracts/bff-token-exchange-request.schema.json).
`environment` and `redirectUri` are server-owned PAR state and are not accepted from the
app; taking them from the client would let a compromised app redirect the exchange.

`../server` implements PAR, token exchange, and optional refresh and revoke endpoints.

## Checklist

1. Onboard and receive your `clientId`.
2. Register your HTTPS redirect URI and your app identity metadata.
3. If server-mediated: implement PAR and token exchange on your backend.
4. Configure the SDK with `clientId`, `redirectUri` and environment.
5. Handle every outcome: success, cancelled, timeout, busy, and each error code.
6. Store tokens per [Token storage](TOKEN-STORAGE.md). No SDK persists them for you.

## Support

- Integration: `integration@pass.krd`
- Security reports: `security@pass.krd`
- Issues: <https://github.com/ditkrg/krdpass-auth-samples/issues>
