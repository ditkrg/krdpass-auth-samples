# KRDPASS Auth SDK Protocol Specification

**Version:** 2.0
**Status:** Canonical Reference

This document defines the shared API surface, error handling patterns, and security protocols that all KRDPASS Auth SDKs (Android, iOS, Flutter, React Native) adhere to. It serves as a reference for contributors and power users understanding the underlying contract.

## Table of Contents
- [Initialization](#initialization--configuration)
- [Authentication](#authentication-methods)
- [Token Management](#token-operations)
- [Error Handling](#error-codes)
- [Security Standards](#redirect-validation)

## Public API Surface

### Initialization & Configuration

Native SDKs support singleton pattern initialization, while React Native uses a functional configuration approach.

- **Android:** `KrdpassAuth.initialize(config)`
- **iOS:** `KrdpassAuth.configure(config)`
- **Flutter:** `KrdpassAuth.instance.initialize(config)`
- **React Native:** Configuration passed per-method

### Authentication Methods

Standard OAuth 2.0 + PKCE flow initiation.

**Signature:** `authenticate(requestUri, state?, timeout?) -> AuthResult`

- Launches KRDPASS application for secure user authentication.
- Returns an authorization code for backend exchange.
- Handles PKCE challenge generation and verification automatically.

### Token Operations

- `verifyToken(token)`: ID Token signature and claim verification.
- `getUserInfo(accessToken)`: Retrieval of user profile data.
- `refreshTokens(refreshToken)`: Access token renewal (requires specific permission).
- `revokeToken(token)`: Secure token invalidation.

## Configuration Model

All SDKs accept a unified configuration object:

```typescript
interface KrdpassConfig {
  clientId: string;           // Your assigned Client ID
  redirectUri: string;        // Your HTTPS callback URI
  environment?: 'Production' | 'Development'; // Default: Production
}
```

## Error Handling

Standardized error codes across all platforms to ensure consistent handling logic.

| Error Code | Description |
|------------|-------------|
| `cancelled` | User or system cancelled the operation |
| `timeout` | Operation triggered defined timeout |
| `busy` | An auth session is already in progress |
| `state_mismatch` | Security warning: State parameter check failed |
| `invalid_redirect` | Security warning: Redirect URI does not match config |
| `no_code` | Protocol error: Response missing authorization code |
| `launch_failed` | Failed to open KRDPASS application |
| `platform_error` | Underlying OS-specific error |

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
but is **not implemented** — it needs a CAS change that has not been made.
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
| Singleton Access | `KrdpassAuth` (Object) | `KrdpassAuth.shared` | `KrdpassAuth.instance` | N/A (Functional) |
| PKCE Support | Built-in | Built-in | Built-in | Built-in |
| Auth transport | Explicit intent + ActivityResult | Universal Link hand-off | Platform-native | Platform-native |

---
**Maintained By:** KRDPASS Developer Platform
