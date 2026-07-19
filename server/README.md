# KRDPASS Server Reference (Node.js)

Reference backend for **server-mediated KRDPASS OAuth**.

This server demonstrates:
- PAR request handling
- Authorization code exchange
- Optional refresh and revoke endpoints
- State and redirect validation

## Important Scope

This is a reference implementation, not a production-ready service.

- Keep `CLIENT_SECRET` and private keys server-side only.
- Replace in-memory state storage with durable storage in production.
- Apply proper auth, rate limits, observability, and secret management before production use.
- Default bind host is `127.0.0.1` for local development safety.

## Prerequisites

- Node.js 18+
- Onboarding-approved credentials from KRDPASS

## Required Onboarding Inputs

- `CLIENT_ID`
- `CLIENT_SECRET`
- RSA private key matching your registered signing key
- Approved scopes and environment
- HTTPS redirect URI registered with KRDPASS

## Step-by-Step Setup

1. Create local env file:

```bash
cp .env.example .env
```

2. Fill required variables in `.env`:

| Variable | Required | Description |
| --- | --- | --- |
| `CLIENT_ID` | Yes | OAuth client ID issued during onboarding |
| `CLIENT_SECRET` | Yes | OAuth client secret issued during onboarding |
| `RSA_PRIVATE_KEY` | Yes | Full PEM private key (escaped with `\\n` in `.env`) |
| `HOST` | No | Bind host, defaults to `127.0.0.1` |
| `PORT` | No | Server port, defaults to `3000` |
| `ALLOWED_REDIRECT_HOSTS` | No (recommended) | Comma-separated host allowlist for `redirectUri` (e.g. `auth.myapp.gov.krd`). When using `scripts/sync-secrets.sh`, the `REDIRECT_URI` host is auto-appended. |
| `DEFAULT_SCOPE` | No | Default scope used when `/oauth/par` request omits `scope` (default: `openid profile`) |
| `DEMO_EXTRAS` | No | Set `true` only if serving AASA/assetlinks from this server |
| `DEMO_IOS_APP_IDS` | If `DEMO_EXTRAS=true` | Comma-separated iOS app IDs (`TEAM_ID.bundle.id`) |
| `DEMO_IOS_TEAM_ID` + `DEMO_IOS_BUNDLE_ID` | If `DEMO_EXTRAS=true` | Single-app fallback for iOS |
| `DEMO_ANDROID_APP_LINKS` | If `DEMO_EXTRAS=true` | Comma-separated `package|SHA256` pairs |
| `DEMO_ANDROID_PACKAGE_NAME` + `DEMO_ANDROID_SHA256` | If `DEMO_EXTRAS=true` | Single-app fallback for Android |

3. Generate RSA private key if needed:

```bash
openssl genrsa -out private-key.pem 2048
```

Then put it into `.env` as one escaped line:

```env
RSA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

4. Install and run:

```bash
npm install
npm start
```

5. Verify health:

```bash
curl http://localhost:3000/health
```

## API Endpoints

- `POST /oauth/par`
- `POST /oauth/token`
- `POST /oauth/token/refresh`
- `POST /oauth/token/revoke`
- `GET /health`

## Security and Policy Notes

- `redirectUri` is validated as HTTPS.
- Optional redirect host allowlist can be enforced with `ALLOWED_REDIRECT_HOSTS`.
- Auth server base URL is selected server-side from `environment` only (no client override), reducing SSRF/misrouting risk.
- `state` is required for token exchange and enforced one-time-use.
- PKCE values are validated using RFC 7636 constraints:
  - `codeChallenge`: base64url, 43-128 chars
  - `codeVerifier`: unreserved URI charset, 43-128 chars
- Request fields are length-bounded (state/nonce/scope/code/token) to reduce abuse surface.
- In-memory `state` storage is capped to limit unbounded growth in local dev runs.
- OAuth endpoints return `Cache-Control: no-store`.
- Refresh token support is exposed for approved integrations, but issuance is usually restricted by default.

## Related Docs

- Root guide: `../README.md`
- Integration guide: `../docs/INTEGRATION.md`
- Sample apps: `../android`, `../ios`, `../flutter`, `../react-native`
