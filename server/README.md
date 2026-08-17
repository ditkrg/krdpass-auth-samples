# KRDPASS Server Reference (Node.js)

Reference backend for **server-mediated KRDPASS OAuth**.

This server demonstrates:
- PAR request handling
- Authorization code exchange
- Optional refresh and revoke endpoints
- Transaction-bound state, redirect, environment, scope, nonce, and PKCE validation
- OIDC ID-token signature and claim validation through the selected CAS discovery/JWKS endpoints

## Important Scope

This is a reference implementation, not a production-ready service.

- Keep `CLIENT_SECRET` and private keys server-side only.
- Replace the demo-only in-memory transaction store with durable, shared storage in production. It must support bounded expiry and atomic get-and-delete so a state cannot be exchanged twice across BFF instances.
- Apply proper auth, rate limits, observability, and secret management before production use.
- Default bind host is `127.0.0.1` for local development safety.

## Dependencies

None. This reference installs zero packages, production or dev. The HTTP
server, HTTP client, JSON body parsing, RSA signing and verification, file
watching, and `.env` loading all come from the Node 24 standard library: a sample
every integrator installs should not drag a dependency tree of advisories along
with it. `npm install` here creates no `node_modules`.

## Prerequisites

- Node.js 24+ (what CI builds on, and what `engines` requires)
- Onboarding-approved credentials from KRDPASS

## Onboarding

This reference is the confidential half of the flow, so it needs `CLIENT_ID`,
`CLIENT_SECRET`, the RSA private key matching your registered signing key, your approved
scopes and environment, and your registered HTTPS redirect URI. See the
[integration guide](../docs/INTEGRATION.md#onboarding).

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
| `ALLOWED_REDIRECT_HOSTS` | Yes | Comma-separated host allowlist for `redirectUri` (e.g. `auth.myapp.gov.krd`). The server refuses to start without it, and an unlisted host is rejected at `/oauth/par`. `.env.example` ships a placeholder so a fresh clone starts; replace it with your registered redirect host. When using `scripts/sync-secrets.sh`, the `REDIRECT_URI` host is auto-appended. |
| `HOST` | No | Bind host, defaults to `127.0.0.1` |
| `PORT` | No | Server port, defaults to `3000` |
| `DEFAULT_SCOPE` | No | Default scope used when `/oauth/par` request omits `scope` (default: `openid profile`) |
| `AUTH_TRANSACTION_TTL_MS` | No | BFF transaction lifetime in ms (default 5 minutes, clamped to 30 seconds to 10 minutes and never longer than CAS PAR expiry) |
| `OIDC_METADATA_CACHE_TTL_MS` | No | CAS discovery metadata cache lifetime in ms (default 1 hour) |
| `DEMO_EXTRAS` | No | Set `true` only if serving AASA/assetlinks from this server |
| `DEMO_IOS_APP_IDS` | If `DEMO_EXTRAS=true` | Comma-separated iOS app IDs (`TEAM_ID.bundle.id`) |
| `DEMO_IOS_TEAM_ID` + `DEMO_IOS_BUNDLE_ID` | If `DEMO_EXTRAS=true` | Single-app fallback for iOS |
| `DEMO_ANDROID_APP_LINKS` | If `DEMO_EXTRAS=true` | Comma-separated `package|SHA256` pairs |
| `DEMO_ANDROID_PACKAGE_NAME` + `DEMO_ANDROID_SHA256` | If `DEMO_EXTRAS=true` | Single-app fallback for Android |
| `DEMO_UNAUTHENTICATED_TOKEN_ROUTES` | No | Set `true` to register `/oauth/token/refresh` and `/oauth/token/revoke`. Off by default; see the warning below. |

**Refresh, revoke and sign-out return 404 until you opt in.** `DEMO_UNAUTHENTICATED_TOKEN_ROUTES`
is `false` by default, and with it unset the two routes are not registered at all. Every
sample's Refresh and Revoke buttons, and the revoke half of Sign Out, fail with a 404 until
you set it to `true` in `.env`. That default is deliberate: both routes attach `CLIENT_SECRET`
to whatever token a caller posts, with no session, cookie, bearer check, or CSRF protection
in front of them. Turn them on for a local demo, never for anything reachable from a network.
See the full warning under "Security and Policy Notes".

`DEMO_EXTRAS=true` is the same shape of switch for the app-link documents. It serves
`/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` from this
server, which is what iOS Universal Links and Android App Links need during onboarding
tests. Off by default, and it needs the `DEMO_IOS_*` / `DEMO_ANDROID_*` values below.

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

For a watch-mode restart while editing, use `npm run dev`.

5. Verify health:

```bash
curl http://localhost:3000/health
```

## API Endpoints

- `POST /oauth/par`
- `POST /oauth/token`
- `POST /oauth/token/refresh` (only when `DEMO_UNAUTHENTICATED_TOKEN_ROUTES=true`)
- `POST /oauth/token/revoke` (only when `DEMO_UNAUTHENTICATED_TOKEN_ROUTES=true`)
- `GET /health`

## Security and Policy Notes

- **`POST /oauth/token/refresh` and `POST /oauth/token/revoke` are unauthenticated in this reference.** There is no session, cookie, bearer check, or CSRF protection in front of either. Anyone who can reach them can post any refresh token or token and this server will attach `CLIENT_SECRET` and act on it at CAS. Both routes are registered only when `DEMO_UNAUTHENTICATED_TOKEN_ROUTES=true` is set.
- In-memory transaction storage is capped and expires entries to limit local-dev growth. It is intentionally not suitable for production, restarts, horizontal scaling, or audit retention.
- Default bind host is `127.0.0.1` for local development safety.
- The `ALLOWED_REDIRECT_HOSTS` allowlist is required and fails closed. An empty or unset allowlist rejects every `redirectUri` rather than allowing any HTTPS host, and the server refuses to start without the variable.

## Related Docs

- Root guide: `../README.md`
- Integration guide: `../docs/INTEGRATION.md`
- Sample apps: `../android`, `../ios`, `../flutter`, `../react-native`, `../react-native-bare`
