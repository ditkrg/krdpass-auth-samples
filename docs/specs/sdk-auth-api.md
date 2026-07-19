# KRDPASS Auth SDK Protocol Specification

**Version:** 1.0  
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
2. **Host Matching:** Incoming redirect host must strictly match configured host.
3. **Path/Query:** Paths and query parameters are permitted but optional.

## Protocol Parity

| Feature | Android | iOS | Flutter | React Native |
|---------|---------|-----|---------|--------------|
| Singleton Access | `KrdpassAuth` (Object) | `KrdpassAuth.shared` | `KrdpassAuth.instance` | N/A (Functional) |
| PKCE Support | Built-in | Built-in | Built-in | Built-in |
| Custom Tabs/SFAuth | Yes | Yes (ASWebAuth) | Yes | Yes |

---
**Maintained By:** KRDPASS Developer Platform
