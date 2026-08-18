# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.5.x   | Yes       |
| < 1.5   | No        |

## Reporting a Vulnerability

If you discover a security vulnerability in the KRDPASS SDK suite, please help us by reporting it responsibly.

### How to Report

Please **DO NOT** report security vulnerabilities through public GitHub issues.

Instead, please report security vulnerabilities by emailing:
**security@pass.krd**

### What to Include

When reporting a security vulnerability, please include:

1. **Description**: A clear description of the vulnerability
2. **Steps to Reproduce**: Detailed steps to reproduce the issue
3. **Impact**: What an attacker could achieve by exploiting this vulnerability
4. **Environment**: SDK name/version, platform version, device information
5. **Proof of Concept**: If possible, include a proof of concept

### Our Commitment

- We will acknowledge receipt of your vulnerability report within 48 hours
- We will provide a more detailed response within 7 days indicating our next steps
- We will keep you informed about our progress throughout the process
- We will credit you (with your permission) when the vulnerability is disclosed

## Security Best Practices

### For Users of the SDKs

**No SDK persists tokens.** That is deliberate: the SDK returns tokens to you
and forgets them, so it never becomes the component that chose your storage.
How to persist a refresh token is in [Token storage](TOKEN-STORAGE.md).

Beyond storage:

- Pin the SDK to a released tag or Maven version, and read the CHANGELOG before
  moving. Do not track a branch.
- Send the `state` your backend's PAR call returned. Every SDK fails closed on a
  blank or mismatched `state`; do not work around that.
- Treat `../server` as dev-only reference code. It is a correct reference
  implementation, not a hardened deployment: read
  [`../server/README.md`](../server/README.md) before adapting it.
- Set `ALLOWED_REDIRECT_HOSTS` if you adapt the reference BFF. It is required:
  the server refuses to start without it, and an empty allowlist rejects every
  `redirectUri`.

### Working In This Repository

- Do not log response bodies from CAS. A non-2xx from `/connect/userinfo`
  carries citizen claims.
- Do not commit anything `scripts/sync-secrets.sh` writes. It defaults to
  leaving tracked files alone; if you pass `--patch-tracked`, check
  `git status` before committing.

SDK-side policy (API compatibility baselines, cross-platform message parity,
redirect-validation vectors) lives in each SDK repository, next to the code and
the tests that enforce it. It is not restated here, because a copy in this
repository would only drift.

## Protocol Guarantees

### Native Caller and Redirect Trust

For Android app-to-app sign-in, caller proof is derived from the Android
Activity-result relationship: KRDPASS receives the operating-system-reported
package name and signing certificate. Intent extras, referrer values, URLs, and
JavaScript data are untrusted input and must not authorize a client.

Native and browser transports have different trust signals. A native launch
uses an Activity Result; a browser launch has no native caller proof and must
be authorized independently as a browser client. A failed native transaction
must not silently downgrade to an external browser launch.

Redirect validation requires exact HTTPS origin, encoded-path, and
registered-query matching. The shared vectors in
[`shared/test-vectors/redirect-validation.json`](../shared/test-vectors/redirect-validation.json)
define the contract.

CAA bootstrap uses the v1 envelope, documented in
[the protocol specification](specs/sdk-auth-api.md#caa-bootstrap-contract). A
native Android caller is identified by a `FingerPrint` of
`<SHA-256>|<package>`, where the package name is taken from the Activity's
`callingPackage`. `getReferrer()` and intent extras are caller-controlled and
must never be used as the identity source.

For BFF token exchange, the mobile app sends only the authorization code, PKCE
verifier, and state. The BFF retrieves environment and the exact redirect URI
from server-side PAR state; it never accepts those security decisions again
from the mobile client. See
[`bff-token-exchange-request.schema.json`](../shared/contracts/bff-token-exchange-request.schema.json).

### Sensitive Data Protection

Android, iOS and Flutter redact tokens, authorization codes and PKCE values in
the string representation of their result types, so an accidental
`print(tokens)` does not leak them:

- **Authorization Codes**: redacted (`AuthResult.Success`, `AuthResponse`)
- **Access and refresh tokens**: redacted (`KrdpassTokenResult`)
- **PKCE values**: redacted (`PkcePair`)
- **Client credentials**: never stored, never logged

**React Native is the exception.** Its result types are plain TypeScript
interfaces with no custom `toString`, so `console.log(tokens)` prints the raw
access token. Redact at the call site in React Native apps.

None of the SDKs logs anything unless you install a logger, and React Native
has no logging hook at all, so it never logs. No SDK logs an OAuth URL with
its query string attached.

## Contact

For security-related questions or concerns:
- Email: security@pass.krd
- General Support: integration@pass.krd
