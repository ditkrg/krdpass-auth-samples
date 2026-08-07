# KRDPASS Auth SDK Protocol Specification

**Applies to:** SDK 1.3.x
**Status:** Canonical Reference

This document defines the shared API surface, error handling patterns, and security protocols that all KRDPASS Auth SDKs (Android, iOS, Flutter, React Native) adhere to. It serves as a reference for contributors and power users understanding the underlying contract.

"v1" and "v2" in this document refer only to the CAA bootstrap envelope, never
to an SDK release. See [CAA Bootstrap Contract](#caa-bootstrap-contract).

## Table of Contents
- [Initialization](#initialization--configuration)
- [Authentication](#authentication-methods)
- [Token Management](#token-operations)
- [Error Handling](#error-handling)
- [Security Standards](#redirect-validation-rules)

## Public API Surface

### Initialization & Configuration

Every SDK is configured once, up front, and holds the configuration for the
process. React Native exposes this as a module-level function rather than a
singleton object, but it is still called once and still global.

- **Android:** `KrdpassAuth.initialize(config)`
- **iOS:** `KrdpassAuth.initialize(_:urlOpener:urlSession:)`
- **Flutter:** `KrdpassAuth.instance.initialize(config: config)`
- **React Native:** `initialize(config)`, exported from the package root

### Authentication Methods

Two flows. They differ in who holds the client secret and in who drives PKCE:
your app in the server-mediated flow, the SDK itself in the client-only one. The
backend owns PKCE in neither.

**Server-mediated:** `authenticate(requestUri, state, timeout?) -> AuthResult`

- Your app owns PKCE. Call `generatePkcePair()` first, send only the
  `codeChallenge` to your backend for the Pushed Authorization Request, and keep
  the `codeVerifier` in the app. Your backend performs the PAR and, later, the
  token exchange, but it never sees the verifier until you send it, so it does
  not own PKCE.
- `state` is app-generated too: `generateState()`, passed to your backend with
  the challenge and echoed back with the `request_uri`. It is **required** on
  `authenticate`. Every SDK fails closed with `invalid_request` when it is null
  or blank; CSRF validation cannot be skipped.
- Launches the KRDPASS app and returns an authorization code. Send that code, the
  `codeVerifier` you kept, and the same `state` to your backend, which exchanges
  them.

**Client-only:** `signIn(scopes?, timeout?) -> KrdpassTokenResult`

- The SDK runs PKCE and PAR itself, launches KRDPASS, exchanges the code, and
  validates the returned `id_token` against the `nonce` it pushed.
- `state` and `nonce` are generated internally and are not caller-visible.
- The caller timeout is additionally bounded by the PAR `request_uri` lifetime;
  the SDK does not wait past the consent session it is waiting on.

The timeout unit is per-platform, so read the signature rather than assuming a
shared one. Android takes `timeoutMillis: Long`, in milliseconds. iOS takes
`timeout: TimeInterval`, which is seconds by definition, defaulting to `300.0`.
Flutter takes a `Duration`, defaulting to five minutes. React Native takes
`timeout` in seconds, and its Android bridge multiplies by 1000 before the value
reaches the core. Each stack is internally consistent; there is no unit bug, only
four conventions.

### Token Operations

- `verifyToken(token, clockSkewSeconds?)`: verifies the ID token signature
  against the environment's JWKS and validates `exp`, `aud` and `iss`, with
  `iss` pinned to the configured environment's authorization server and `aud`
  pinned by exact equality (see
  [ID token audience rules](#id-token-audience-rules)). The first
  call fetches the JWKS; that fetch is off the calling thread on every platform
  (on Android `verifyToken` is a `suspend` function running on
  `Dispatchers.IO`), so callers do not need to move it themselves.
- `getUserInfo(accessToken)`: retrieves user profile claims. The typed fields
  are a convenience view; the full claim set is always on `raw`. Includes a
  typed `upns` field alongside the existing `upn`: an array of strings, empty
  when the `citizen_identity` claim carries none. Per the developer manual,
  `upn` and `upns` are MANDATORY to store and MUST NOT be displayed to the
  user.
- `refreshTokens(refreshToken, scope?)`: renews the access token. Requires the
  `offline_access` scope to have been granted at sign-in, otherwise no refresh
  token was issued.
- `revokeToken(token, tokenTypeHint?)`: invalidates a token at the
  authorization server.
- `decodeTokenUnverified(token)`: decodes claims **without verifying the
  signature**. Never use the result for a trust or authorization decision.

## Configuration Model

All SDKs accept a unified configuration object:

```typescript
interface KrdpassConfig {
  clientId: string;           // Your assigned Client ID
  redirectUri: string;        // Your HTTPS callback URI
  environment?: 'production' | 'development'; // Default: production
}
```

`environment` is a native enum on Android (`KrdpassEnvironment.Production` /
`.Development`), iOS (`.production` / `.development`) and Flutter
(`KrdpassEnvironment.production` / `.development`). The lowercase string form
above is the wire value used across the Flutter and React Native bridges. An
unrecognised value is rejected; it is never silently coerced to an environment.

`redirectUri` must satisfy the [redirect validation rules](#redirect-validation-rules).
Nothing anywhere accepts a configured URI carrying userinfo, a fragment,
malformed percent-encoding, or an OAuth response parameter name. Where the
rejection lands differs by stack: Android and Flutter's Android side reject at
`initialize`; iOS, both native and under Flutter, rejects immediately before the
launch; React Native's Android side uses the launch-decoupled core entry points,
which do not run the configuration check, so it rejects on the response with
`invalid_redirect`. The guarantee is the same in every case, and it is the one
that matters: a bad redirect fails closed before any authorization code or token
is accepted. It is not a guarantee that the failure surfaces at configuration
time.

## Error Handling

Standardized error codes across all platforms to ensure consistent handling logic.

This table is the union of every code the four SDKs emit, and the wire string is
the field of record: where two SDKs emit the same code they emit it
byte-identically, and no SDK renames one. It is not a uniformity claim. Most
codes come from the two native cores and reach Flutter and React Native
forwarded verbatim, so they are available everywhere; the last three rows are
produced by a specific SDK and the **Emitted by** column says which. Each SDK
README documents the subset that SDK can actually produce. A README listing a
code that is not here, or claiming one this table marks as platform-specific, is
a defect in one of the two.

| Code | Emitted by | Meaning | Typical handling |
| --- | --- | --- | --- |
| `cancelled` | All | User cancelled or declined in KRDPASS. Both native cores rewrite `access_denied`, `user_cancelled`, `login_required` and `consent_denied` to this before any caller sees them; the iOS core also accepts the literal `cancelled` (harmless, since `cancelled` already maps to `cancelled`). None of them is ever observable to a caller and none is worth a branch | Usually no UI needed |
| `timeout` | All | Auth window elapsed | Offer retry |
| `busy` | All | Another authentication is in progress | Ignore or queue |
| `state_mismatch` | All | Returned state differs from expected (possible CSRF/response injection) | Fail closed and restart |
| `issuer_mismatch` | All | Response carried an RFC 9207 `iss` that is not the configured environment's authorization server (possible mix-up attack) | Fail closed and restart |
| `nonce_mismatch` | All | The id_token carried a `nonce` that is not the one this client sent (possible token replay) | Fail closed and restart |
| `invalid_id_token` | All | The id_token failed verification: signature, `iss`, `aud`, `exp`, or it was absent from the token response | Fail closed and restart |
| `invalid_redirect` | All | Redirect URI does not match the exact configured endpoint (scheme, host, port, path, and fixed query) | Check onboarding config |
| `invalid_request` | All | Malformed or blank request parameters | Fix the integration |
| `request_expired` | All | The request_uri expired inside KRDPASS (NOT a cancellation) | Restart with a fresh PAR request |
| `launch_failed` | All | The KRDPASS app could not be launched | Retry or check installation |
| `provider_not_installed` | All | KRDPASS app not installed (`installUrl` is provided) | Open it |
| `no_code` | All | Provider returned no authorization code | Restart the flow |
| `network_error` | All | Transport failure, or a retryable status from CAS, on any call | Safe to retry |
| `platform_error` | All | Platform-level failure such as an unregistered caller | Log and report |
| `verification_failed` | All | `verifyToken` failed for a reason that is neither a signature or claim failure nor an unfetchable JWKS | Log and report |
| `pkce_generation_failed` | iOS, React Native | The device could not produce a secure PKCE pair or `state`. Android and Flutter generate both without a failure path, so neither emits this | Fail closed, do not proceed |
| `authentication_failed` | Flutter, React Native | Bridge fallback when the native core reported a failure carrying no more specific code. On Android and iOS the same failure arrives as an `AuthenticationFailed` with a null `code` | Log and report |
| `refresh_failed`, `revoke_failed`, `user_info_failed` | Flutter, React Native | The named call failed for a reason that is not retryable (4xx, malformed response). Both bridges supply these; the Android and iOS cores leave the code null and put the reason in the message | Log and report |

## Redirect Validation Rules

To ensure security, strict validation is applied to Redirect URIs:

1. **Protocol:** Must be `https` (no custom schemes or `http`).
2. **Authority:** Incoming scheme, host, and effective port must match the configured URI.
3. **Path:** The encoded callback path must exactly match the configured URI; a
   same-host path is not interchangeable.
4. **Query:** Any query parameters registered in the redirect URI must be
   retained with the same values and multiplicity. Single-valued authorization
   response metadata may be appended and is ignored unless consumed by the
   protocol. Duplicate parameters and extra occurrences of registered query
   names are rejected.
5. **No userinfo or fragments:** Neither the configured URI nor the response
   URI may contain userinfo or a fragment.

The shared [redirect validation vectors](../../shared/test-vectors/redirect-validation.json)
are the executable cross-platform contract. The authorization server remains
the final authority for registered redirect URI matching; SDK validation is
defence in depth.

## ID Token Audience Rules

`aud` must equal exactly the configured `clientId`. A bare-string `aud` is
accepted, and so is a single-element array holding the client id and nothing
else. Any ID token carrying a second audience is rejected outright, by both
native cores and so by all four SDKs.

This is stricter than OIDC Core 3.1.3.7 step 3, which only requires `aud` to
**contain** the client id. No confirmed CAS deployment issues multi-audience ID
tokens, so the check is not being loosened for a token shape nobody has
observed. Both cores carry a tripwire test asserting multi-audience rejection,
so relaxing the pin cannot pass silently.

The `azp` rule is implemented on both cores, in both of its arms:

- **Step 5:** an `azp` that is present at all must equal the `clientId`,
  whatever the audience count. A single-audience token carrying another client's
  `azp` is one the issuer says was authorized for somebody else, and it is
  rejected. An absent `azp` at a single audience stays legal: that is the
  ordinary shape of the ID tokens CAS issues today, and `aud` alone already pins
  the token to you.
- **Step 4:** a multi-audience token must carry an `azp` naming the `clientId`,
  required rather than merely checked-if-present. This arm is currently
  unreachable, because the exact-match `aud` rule above rejects every
  multi-audience token before it is evaluated. It is kept because it becomes the
  operative check the moment anyone relaxes the `aud` pin to containment.

**Known asymmetry with the reference BFF.** `server/server.js` checks `aud` by
containment (`audiences.includes(CLIENT_ID)`), not by exact equality, so the
reference server accepts a multi-audience ID token that both SDK cores reject.
Its `azp` guard is the same one the SDKs run. The difference is known and
accepted, and is not a bug in either: the server is a reference implementation
of the BFF contract, and the SDKs hold the stricter line on the client side.

If CAS ever begins issuing multi-audience ID tokens, this is the rule that
breaks sign-in. Changing it is a coordinated decision across all four SDKs and
the reference server, not a local edit to whichever verifier failed first.

**ID token verification on refresh.** A refresh response is not required to
carry an `id_token`, and one with no `id_token` is valid: `refreshTokens`
succeeds without running any of the checks above. When a refresh response does
carry a non-empty `id_token`, both native cores verify it exactly as they
verify the sign-in `id_token`. Flutter and React Native inherit this through
their native cores.

## CAA Bootstrap Contract

CAA accepts the v1 envelope: the authorization parameters as flat top-level
fields, a `returnUrl` pointing at `/connect/authorize/callback`, and, for a
native Android caller, a `FingerPrint` of `<SHA-256>|<package>` where the
SHA-256 is colon-separated uppercase hex.

The package name must come from the OS. On Android that is the Activity's
`callingPackage`; `getReferrer()` and intent extras are caller-controlled and
must not be used.

A structured v2 envelope carrying `protocolVersion`, `authorizationRequest` and
`callerIdentity` is drafted in
[`proposed/caa-bootstrap-v2.schema.json`](../../shared/contracts/proposed/caa-bootstrap-v2.schema.json)
but is **not implemented**: it needs a CAS change that has not been made.
Nothing sends or accepts it today.

## BFF Token Exchange Contract

The app-facing `POST /oauth/token` request contains exactly `code`,
`codeVerifier`, and `state`, as defined by
[`bff-token-exchange-request.schema.json`](../../shared/contracts/bff-token-exchange-request.schema.json).
The BFF restores `environment` and the exact `redirectUri` from its server-side
PAR state. The confidential BFF-to-CAS token request still includes
`redirect_uri` as required by OAuth; it is a separate contract.

## Native Caller Trust

For Android app-to-app sign-in, the SDK launches KRDPASS for an **Activity
Result**. KRDPASS derives the calling package and signing certificate from the
Android OS result relationship; app-provided extras, referrer values, URLs, and
JavaScript data are not caller proof.

Browser/web launches are a separate transport. They do not carry Android
Activity-result identity and must be authorized as browser clients by the
authorization service. A failed native Activity-result transaction remains a
native failure and is not converted into a browser launch.

## Protocol Parity

| Feature | Android | iOS | Flutter | React Native |
|---------|---------|-----|---------|--------------|
| Entry point | `KrdpassAuth` (object) | `KrdpassAuth.shared` | `KrdpassAuth.instance` | module-level functions |
| PKCE Support | Built-in | Built-in | Built-in | Built-in |
| Auth transport | Explicit intent + ActivityResult | Universal Link hand-off | Platform-native | Platform-native |
| Redirect validation | Native | Native | Delegates to native | Delegates to native |
| Typed error enum | `AuthErrorCode` | `AuthError` constants | `KrdpassException` hierarchy | `KrdpassAuthError.code` |
| Logging hook | `KrdpassLogger` | `KrdpassLogger` | `KrdpassLogger` | none |
| Token redaction in `toString` | Yes | Yes | Yes | No, plain interfaces |
| Verifies refresh-response `id_token` | Yes | Yes | Yes (native core) | Yes (native core) |

---
**Maintained By:** KRDPASS Developer Platform
