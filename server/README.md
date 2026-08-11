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

- `redirectUri` is validated as HTTPS.
- The `ALLOWED_REDIRECT_HOSTS` allowlist is required and fails closed. An empty or unset allowlist rejects every `redirectUri` rather than allowing any HTTPS host, and the server refuses to start without the variable. Without it, a caller could push its own `redirectUri`, have this server sign it with `RSA_PRIVATE_KEY` and authenticate it with `CLIENT_SECRET`, and receive the resulting authorization code itself.
- Auth server base URL is selected server-side from `environment` only (no client override), reducing SSRF/misrouting risk.
- `state` is required for token exchange and enforced one-time-use.
- `/oauth/par` stores an immutable authorization transaction: state, nonce, PKCE S256 challenge, redirect URI, environment/CAS issuer, scope, and expiry. `/oauth/token` accepts only `code`, `state`, and `codeVerifier`; it uses the stored transaction values for CAS.
- The sign-in BFF requires the `openid` scope because it verifies the returned ID token before reporting success.
- The BFF recomputes the PKCE S256 challenge from `codeVerifier` and rejects a mismatch before it calls CAS.
- A state is consumed before any upstream request, including on a PKCE mismatch. Start a new authorization flow after a failed exchange attempt.
- A code-flow success requires a signed `id_token`. The BFF retrieves the selected CAS environment's OIDC discovery document and JWKS, then validates the signing algorithm, signature, issuer, audience, expiry, and transaction nonce before returning tokens. Discovery/JWKS failures fail closed.
- PKCE values are validated using RFC 7636 constraints:
  - `codeChallenge`: base64url, 43-128 chars
  - `codeVerifier`: unreserved URI charset, 43-128 chars
- Request fields are length-bounded (state/nonce/scope/code/token) to reduce abuse surface.
- In-memory transaction storage is capped and expires entries to limit local-dev growth. It is intentionally not suitable for production, restarts, horizontal scaling, or audit retention.
- OAuth endpoints return `Cache-Control: no-store` and `Pragma: no-cache`.
- `/oauth` is rate limited to 30 requests per minute, keyed on the socket peer address. `X-Forwarded-For` is never used, so a caller cannot mint a fresh limit key by sending a header. The trade-off: behind a reverse proxy such as `cloudflared` every request arrives from localhost, so the key collapses to a single global bucket and one noisy caller rate limits everyone. A real deployment configures a trusted-proxy hop count and reads the client address from that position in the forwarded chain.
- There is no CORS handling, deliberately. The callers are native apps, which are not subject to the same-origin policy, so no `Access-Control-Allow-Origin` header is needed and none is sent. A browser-based client calling this BFF from another origin will be blocked by the browser; add an explicit origin allowlist before serving one.
- Request bodies are capped at 32 kB and must be declared `application/json`. Anything larger gets a `413`, anything unparseable a `400`, and neither reaches a route.
- The ID token verifier hardcodes RS256, which is the only algorithm CAS advertises. The token's own `alg` is read only to reject anything that is not exactly RS256, and `kid` only ever selects a key. There is no code path that could verify an unsigned token or an HMAC one, so algorithm confusion is impossible by construction rather than caught by a check.
- A refresh response that carries an `id_token` is verified exactly as the sign-in one is: algorithm, signature against the environment's JWKS, issuer, audience, `azp`, expiry, and `nbf`. The one check that does not apply is the nonce, because a refresh has no authorization transaction behind it to bind one to. A refresh response with no `id_token` is valid and passes through unverified, as the protocol allows.
- Signing keys are cached per (JWKS URI, `kid`) for 10 minutes rather than refetched on every verification. An unknown `kid` against a still-fresh cache triggers one early refetch, then no more for 60 seconds, so a stream of invented `kid` values cannot turn this server into a JWKS flood against CAS.
- A refresh never widens a grant. The scope CAS returns at token exchange is recorded against a hash of the refresh token, and a later refresh is narrowed to that set: extra scopes in the request are dropped, and a request with nothing in common with the grant is sent narrowed to nothing so CAS answers `invalid_scope` rather than the BFF quietly returning the full grant. A refresh that carries no scope at all is forwarded with the parameter omitted, which is how RFC 6749 asks for the grant as issued. This map demonstrates where a BFF hangs its down-scoping; it is not the control. It is best effort, empty after a restart or for a refresh token minted elsewhere, and CAS enforces the grant on every refresh whether or not this process remembers it.
- Refresh token support is exposed for approved integrations, but issuance is usually restricted by default.
- **`POST /oauth/token/refresh` and `POST /oauth/token/revoke` are unauthenticated in this reference.** There is no session, cookie, bearer check, or CSRF protection in front of either. Anyone who can reach them can post any refresh token or token and this server will attach `CLIENT_SECRET` and act on it at CAS. That makes a stolen refresh token, which is inert against CAS on its own, usable, and it makes revocation a denial-of-service primitive against other people's sessions. A production deployment must bind the refresh token to a server-side session at `/oauth/token`, stop returning it to the client, and look it up from that session instead of accepting one from the request body. Because of this, both routes are registered only when `DEMO_UNAUTHENTICATED_TOKEN_ROUTES=true` is set. With the flag unset (the default), a request to either path gets the same clean 404 as any other unknown route.
- CAS failures and unexpected errors are logged in full server-side but returned to the caller as an OAuth error code only. Upstream response bodies and Node error strings are never relayed, so this BFF cannot be used from outside as a probe for CAS.
- Every error response uses the RFC 6749 section 5.2 shape: a machine-readable `error` code (`invalid_request`, `invalid_grant`, `invalid_scope`, `temporarily_unavailable`, `server_error`) plus a human `error_description`. Branch on `error`, never on the description text.
- Security headers are set explicitly for a JSON API: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and HSTS. CSP, frameguard, COOP, and CORP are deliberately absent because they govern how a document loads or is isolated, and this server serves no document. No `X-Powered-By` is sent.

## Related Docs

- Root guide: `../README.md`
- Integration guide: `../docs/INTEGRATION.md`
- Sample apps: `../android`, `../ios`, `../flutter`, `../react-native`, `../react-native-bare`
