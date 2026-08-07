/**
 * KRDPASS Demo Server
 *
 * This server demonstrates how to integrate "Sign in with KRDPASS"
 * using PAR (Pushed Authorization Requests) and JAR (JWT-secured Authorization Requests).
 *
 * Flow:
 * 1. Your app generates PKCE (code_verifier + code_challenge)
 * 2. Your app calls POST /oauth/par with the code_challenge
 * 3. This server pushes a signed request to CAS and returns a request_uri
 * 4. Your app opens KRDPASS with that request_uri
 * 5. User approves in KRDPASS, your app receives a code
 * 6. Your app calls POST /oauth/token with the code, state, and code_verifier
 * 7. This server exchanges the code for tokens and returns them
 *
 * This reference has no runtime dependencies. Everything it needs (HTTP server,
 * HTTP client, JSON body parsing, RSA signing and verification, env file
 * loading) is in the Node 24 standard library. Fewer packages means fewer
 * supply-chain advisories to chase on a sample every integrator installs.
 */

import crypto from 'node:crypto';
import http from 'node:http';
import { resolveExtrasRoutes } from './extras.js';

// Configuration

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const SCOPE = (process.env.DEFAULT_SCOPE || 'openid profile').trim();
const RSA_PRIVATE_KEY = process.env.RSA_PRIVATE_KEY?.replace(/\\n/g, '\n');
const HOST = process.env.HOST || '127.0.0.1';
const PORT = process.env.PORT || 3000;

const REDIRECT_HOST_ALLOWLIST = (process.env.ALLOWED_REDIRECT_HOSTS || '')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);
const AUTH_SERVER_BY_ENV = Object.freeze({
  production: 'https://account.id.krd',
  development: 'https://auth.dev.krd',
});
const CANONICAL_ENV_BY_ALIAS = Object.freeze({
  production: 'production',
  prod: 'production',
  development: 'development',
  dev: 'development',
});
const PKCE_CODE_CHALLENGE_REGEX = /^[A-Za-z0-9_-]{43,128}$/;
const PKCE_CODE_VERIFIER_REGEX = /^[A-Za-z0-9._~-]{43,128}$/;
const MAX_SCOPE_LENGTH = 512;
const MAX_STATE_LENGTH = 256;
const MAX_NONCE_LENGTH = 256;
const MAX_CODE_LENGTH = 4096;
const MAX_TOKEN_LENGTH = 8192;
const MAX_STATE_STORE_ENTRIES = 5000;
const MAX_JSON_BODY_BYTES = 32 * 1024;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const CAS_HTTP_TIMEOUT_MS = Number(process.env.CAS_HTTP_TIMEOUT_MS) || 10000;
const AUTH_TRANSACTION_TTL_MS = Math.min(
  Math.max(Number(process.env.AUTH_TRANSACTION_TTL_MS) || 5 * 60 * 1000, 30 * 1000),
  10 * 60 * 1000,
);
const OIDC_METADATA_CACHE_TTL_MS = Math.min(
  Math.max(Number(process.env.OIDC_METADATA_CACHE_TTL_MS) || 60 * 60 * 1000, 60 * 1000),
  24 * 60 * 60 * 1000,
);

// The only signing algorithm this server produces or accepts. CAS advertises
// exactly RS256 in id_token_signing_alg_values_supported and publishes one
// RSA key with "alg": "RS256", so there is nothing to negotiate.
const JWT_ALGORITHM = 'RS256';
const ID_TOKEN_CLOCK_TOLERANCE_SECONDS = 30;
const REQUEST_JWT_LIFETIME_SECONDS = 5 * 60;

// CAS HTTP client (native fetch)

// fetch resolves for a 4xx or 5xx instead of throwing, so a CAS rejection would
// read as a successful exchange unless the throw is explicit. This error type
// carries the upstream status and body so sendUpstreamError can map it and
// logSafeError can record it. The property is named upstreamStatus, not status,
// so a local error that happens to carry a status can never be mistaken for a
// CAS response and mapped into a caller-owned 4xx.
class UpstreamError extends Error {
  constructor(message, { upstreamStatus, data, endpoint, method } = {}) {
    super(message);
    this.name = 'UpstreamError';
    this.upstreamStatus = upstreamStatus;
    this.data = data;
    this.endpoint = endpoint;
    this.method = method;
  }
}

// A caller-caused input problem that never reached CAS, such as an unrecognized
// environment value. Route handlers check `instanceof ValidationError` to send a
// 400 with the error's own message, the same way UpstreamError lets them check
// what CAS said instead of guessing from a message string.
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

// A hard timeout on every CAS call so a slow or unresponsive upstream cannot
// pile up open sockets and hang the server. AbortSignal.timeout covers the
// whole exchange, headers and body, not just connect.
const casRequest = async (method, url, body) => {
  let response;
  try {
    response = await fetch(url, {
      method,
      body,
      signal: AbortSignal.timeout(CAS_HTTP_TIMEOUT_MS),
    });
  } catch (err) {
    // No response at all: timeout, DNS, TLS. Left without an upstream status so
    // sendUpstreamError maps it to 502, never a 4xx the caller would try to fix by
    // resending different input.
    throw new UpstreamError(`CAS request failed: ${err.message}`, { endpoint: url, method });
  }

  const text = await response.text();
  let data;
  if (text.length > 0) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new UpstreamError('CAS response body is not JSON', {
        upstreamStatus: response.status,
        endpoint: url,
        method,
      });
    }
  }

  if (!response.ok) {
    throw new UpstreamError(`CAS responded with ${response.status}`, {
      upstreamStatus: response.status,
      data,
      endpoint: url,
      method,
    });
  }
  return { data };
};

const casHttp = {
  get: (url) => casRequest('GET', url),
  post: (url, body) => casRequest('POST', url, body),
};

// JWT (RS256 only, on node:crypto)

const base64UrlJson = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

// crypto.sign with the sha256 digest and PKCS#1 v1.5 padding on an RSA key is
// exactly RS256. The algorithm is a constant here, never taken from input.
const signRs256Jwt = (claims, privateKeyPem, lifetimeSeconds) => {
  const issuedAt = Math.floor(Date.now() / 1000);
  const signingInput = `${base64UrlJson({ alg: JWT_ALGORITHM, typ: 'JWT' })}.${base64UrlJson({
    ...claims,
    iat: issuedAt,
    exp: issuedAt + lifetimeSeconds,
  })}`;
  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: privateKeyPem,
    padding: crypto.constants.RSA_PKCS1_PADDING,
  });
  return `${signingInput}.${signature.toString('base64url')}`;
};

const decodeJwtSegment = (segment, label) => {
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  } catch {
    throw new Error(`ID token ${label} could not be read`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`ID token ${label} is not a JSON object`);
  }
  return parsed;
};

const parseCompactJws = (token) => {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('ID token is not a compact JWS serialization');
  }
  return {
    header: decodeJwtSegment(parts[0], 'header'),
    payloadSegment: parts[1],
    signatureSegment: parts[2],
    signingInput: `${parts[0]}.${parts[1]}`,
  };
};

// Logging helpers
const maskState = (state) => {
  if (!state) return 'null';
  const value = String(state);
  if (value.length <= 8) return `${value.slice(0, 1)}...(len:${value.length})`;
  return `${value.slice(0, 4)}...${value.slice(-4)}(len:${value.length})`;
};

const isValidHttpsUrl = (value) => {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
};

const hasLengthBetween = (value, min, max) =>
  typeof value === 'string' && value.length >= min && value.length <= max;

const isValidCodeChallenge = (value) =>
  typeof value === 'string' && PKCE_CODE_CHALLENGE_REGEX.test(value);

const isValidCodeVerifier = (value) =>
  typeof value === 'string' && PKCE_CODE_VERIFIER_REGEX.test(value);

const generateOpaqueValue = (byteLength = 32) =>
  crypto.randomBytes(byteLength).toString('base64url');

const sanitizeErrorForLog = (err) => {
  const responseData = err?.data;
  const responseError = typeof responseData?.error === 'string' ? responseData.error : undefined;
  const responseErrorDescription =
    typeof responseData?.error_description === 'string' ? responseData.error_description : undefined;

  return {
    name: err?.name,
    message: err?.message,
    code: err?.code ?? err?.cause?.code,
    status: err?.upstreamStatus,
    endpoint: err?.endpoint,
    method: err?.method,
    responseError,
    responseErrorDescription,
  };
};

const logSafeError = (message, err) => {
  console.error(message, sanitizeErrorForLog(err));
};

// Response helpers

// This server returns JSON only, sets no cookies, and serves no HTML, so the
// headers worth having are the transport and content-sniffing ones. CSP,
// frameguard, COOP and CORP all govern how a document is loaded or isolated,
// and there is no document here, so they stay off rather than being
// cargo-culted on. node:http sends no X-Powered-By, so there is none to strip.
const SECURITY_HEADERS = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  // Only takes effect behind a TLS terminator; browsers ignore HSTS served
  // over plain http, which is what the default 127.0.0.1 bind serves.
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
});

const sendJson = (res, status, payload) => {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
  });
  res.end(body);
};

// Client-facing error helpers

// The log gets the detail (see logSafeError above). The client gets a code and
// a fixed description, never an upstream CAS body and never a Node error string.
// Relaying either would turn this BFF into an outside probe for CAS and hand
// internals to anyone who can reach the rate-limited /oauth/* endpoints.
const OAUTH_ERROR_DESCRIPTION = Object.freeze({
  invalid_request: 'The request was rejected by the authorization server.',
  invalid_grant: 'The supplied grant is invalid, expired, revoked, or already used.',
  temporarily_unavailable: 'The authorization server is rate limiting this client. Retry later.',
  server_error: 'The request could not be completed with the authorization server.',
});

const sendOAuthError = (res, status, error, description = OAUTH_ERROR_DESCRIPTION[error]) =>
  sendJson(res, status, { error, error_description: description });

// Upstream status is mapped, not mirrored:
// - 400 is the one case the caller actually caused (bad code, dead refresh
//   token, redirect URI CAS does not accept), so it stays a 4xx the caller owns.
// - 401/403 mean CAS rejected THIS server's client credentials. The caller
//   cannot fix that and should not be told to retry with different input, so it
//   becomes 502.
// - 429 is forwarded so the caller backs off instead of hammering.
// - Everything else, including the cases with no upstream response at all
//   (timeout, DNS, TLS, a local throw such as a failed ID token check), is 502.
//   The BFF could not complete the exchange, and that is not the caller's 4xx.
const sendUpstreamError = (res, err, callerError) => {
  const upstreamStatus = err?.upstreamStatus;
  if (upstreamStatus === 400) return sendOAuthError(res, 400, callerError);
  if (upstreamStatus === 429) return sendOAuthError(res, 429, 'temporarily_unavailable');
  return sendOAuthError(res, 502, 'server_error');
};

// A request with no body, or one this server will not read as JSON, leaves
// req.body undefined. Every route that destructures req.body checks this first
// so it answers with a clean 400 instead of throwing a raw V8 message.
const hasJsonObjectBody = (req) =>
  Boolean(req.body) && typeof req.body === 'object' && !Array.isArray(req.body);

const rejectMissingBody = (res) =>
  sendOAuthError(res, 400, 'invalid_request', 'A JSON object request body is required');

// Fail closed. An empty allowlist used to mean "allow any HTTPS host", which
// made the only BFF-side control over a caller-supplied redirect URI opt-in: a
// caller could push its own redirect URI, get it signed with this server's key
// and client secret, and receive the resulting code itself. ALLOWED_REDIRECT_HOSTS
// is a required startup variable for the same reason.
const isAllowedRedirectUri = (redirectUri) => {
  if (REDIRECT_HOST_ALLOWLIST.length === 0) return false;
  try {
    const parsed = new URL(String(redirectUri));
    return REDIRECT_HOST_ALLOWLIST.includes((parsed.host || '').toLowerCase());
  } catch {
    return false;
  }
};

const resolveAuthServer = (environmentValue) => {
  if (environmentValue == null || String(environmentValue).trim() === '') {
    throw new ValidationError('environment is required and must be one of: production, development');
  }
  const normalized = CANONICAL_ENV_BY_ALIAS[String(environmentValue).trim().toLowerCase()];
  const authServerUrl = AUTH_SERVER_BY_ENV[normalized];
  if (!authServerUrl) {
    throw new ValidationError('environment must be one of: production, development');
  }
  return {
    environment: normalized,
    authServerUrl,
  };
};

// OAuth Functions

/**
 * Creates a signed JWT containing the OAuth request parameters.
 * CAS requires requests to be signed with your private key (JAR/RFC 9101).
 */
function createSignedRequestJwt(params, authServerUrl) {
  return signRs256Jwt(
    {
      ...params,
      iss: CLIENT_ID,
      aud: authServerUrl,
      jti: crypto.randomUUID(),
    },
    RSA_PRIVATE_KEY,
    REQUEST_JWT_LIFETIME_SECONDS,
  );
}

/**
 * Pushes the authorization request to CAS (PAR/RFC 9126).
 * Returns a short-lived request_uri that references the full request.
 */
async function pushAuthorizationRequest({ state, nonce, code_challenge, code_challenge_method, authServerUrl, redirectUri, scope }, httpClient = casHttp) {
  const signedRequest = createSignedRequestJwt({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: scope || SCOPE,
    state,
    nonce,
    code_challenge,
    code_challenge_method,
  }, authServerUrl);

  console.log('[CAS PAR] Request parameters:', {
    client_id: CLIENT_ID,
    scope: scope || SCOPE,
    redirect_uri: redirectUri,
    state: maskState(state),
  });

  const { data } = await httpClient.post(
    `${authServerUrl}/connect/par`,
    new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      request: signedRequest,
    })
  );

  console.log('[CAS PAR] Success');
  return data;
}

/**
 * Exchanges the authorization code for tokens.
 */
async function exchangeCodeForTokens({ code, code_verifier, authServerUrl, redirectUri }, httpClient = casHttp) {
  console.log('[CAS TOKEN] Requesting tokens with code...');
  const { data } = await httpClient.post(
    `${authServerUrl}/connect/token`,
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: redirectUri,
      code,
      code_verifier,
    })
  );

  console.log('[CAS TOKEN] Raw response keys:', Object.keys(data));
  if (data.refresh_token) {
    console.log('[CAS TOKEN] SUCCESS: refresh_token received');
  } else {
    console.log('[CAS TOKEN] WARNING: refresh_token NOT received');
  }
  if (data.scope) {
    console.log('[CAS TOKEN] Granted scope:', data.scope);
  }

  return data;
}

/**
 * Refreshes tokens using a refresh token.
 */
async function refreshTokens({ refreshToken, scope, authServerUrl }, httpClient = casHttp) {
  console.log('[CAS REFRESH] Requesting new tokens...');
  const { data } = await httpClient.post(
    `${authServerUrl}/connect/token`,
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      ...(scope ? { scope } : {}),
    })
  );

  console.log('[CAS REFRESH] Success');
  return data;
}

/**
 * Revokes an access or refresh token.
 */
async function revokeToken({ token, tokenTypeHint, authServerUrl }, httpClient = casHttp) {
  console.log('[CAS REVOKE] Revoking token...');
  await httpClient.post(
    `${authServerUrl}/connect/revocation`,
    new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      token,
      // URLSearchParams serializes `undefined` to the literal string "undefined", so omit the
      // field entirely when a caller doesn't send a hint, mirroring the scope handling above.
      ...(tokenTypeHint ? { token_type_hint: tokenTypeHint } : {}),
    })
  );
  console.log('[CAS REVOKE] Success');
}

const deriveS256Challenge = (codeVerifier) =>
  crypto.createHash('sha256').update(codeVerifier, 'ascii').digest('base64url');

const getOidcMetadata = async (authServerUrl, httpClient = casHttp, metadataCache) => {
  const cached = metadataCache?.get(authServerUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.metadata;

  const discoveryUrl = `${authServerUrl}/.well-known/openid-configuration`;
  const { data } = await httpClient.get(discoveryUrl);
  if (!data || typeof data.issuer !== 'string' || typeof data.jwks_uri !== 'string') {
    throw new Error('CAS OIDC discovery response is missing issuer or jwks_uri');
  }

  const issuer = new URL(data.issuer);
  const jwks = new URL(data.jwks_uri);
  const expected = new URL(authServerUrl);
  if (issuer.protocol !== 'https:' || jwks.protocol !== 'https:' || issuer.origin !== expected.origin || jwks.origin !== expected.origin) {
    throw new Error('CAS OIDC discovery endpoints are not trusted for the selected environment');
  }

  const metadata = { issuer: data.issuer, jwksUri: data.jwks_uri };
  metadataCache?.set(authServerUrl, {
    metadata,
    expiresAt: Date.now() + OIDC_METADATA_CACHE_TTL_MS,
  });
  return metadata;
};

// kid selects a key and nothing else. It never influences which algorithm is
// used, and a key that is not an RS256-capable RSA signing key is not returned.
const getSigningKey = async (jwksUri, keyId, httpClient = casHttp) => {
  if (!keyId) throw new Error('ID token is missing a key id');
  const { data } = await httpClient.get(jwksUri);
  const jwk = data?.keys?.find((key) =>
    key.kid === keyId && key.kty === 'RSA' && key.use !== 'enc' && (!key.alg || key.alg === JWT_ALGORITHM),
  );
  if (!jwk) throw new Error('No matching signing key was found in CAS JWKS');
  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  if (publicKey.asymmetricKeyType !== 'rsa') {
    throw new Error('CAS signing key is not an RSA key');
  }
  return publicKey;
};

/**
 * Verify the ID token before returning a successful code-flow result. Discovery
 * and JWKS are derived only from the selected server-side environment; callers
 * cannot supply either endpoint.
 */
async function verifyIdToken({ idToken, nonce, authServerUrl }, httpClient = casHttp, metadataCache) {
  if (typeof idToken !== 'string' || idToken.length === 0) {
    throw new Error('CAS token response is missing id_token');
  }

  const { header, payloadSegment, signatureSegment, signingInput } = parseCompactJws(idToken);

  // RS256 is hardcoded in every call below. The token's own alg is read here
  // only to reject anything that is not exactly RS256, never to select how the
  // signature gets checked. That makes algorithm confusion structurally
  // impossible instead of merely defended against: "alg": "none" and an HS256
  // token forged with the public key as the HMAC secret both die here, before
  // any key is fetched, because the verifier has no HMAC path to reach.
  if (header.alg !== JWT_ALGORITHM) {
    throw new Error('ID token uses an unsupported signing algorithm');
  }
  if (signatureSegment.length === 0) {
    throw new Error('ID token has no signature');
  }

  const metadata = await getOidcMetadata(authServerUrl, httpClient, metadataCache);
  const signingKey = await getSigningKey(metadata.jwksUri, header.kid, httpClient);
  const signatureIsValid = crypto.verify(
    'sha256',
    Buffer.from(signingInput),
    { key: signingKey, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(signatureSegment, 'base64url'),
  );
  if (!signatureIsValid) {
    throw new Error('ID token signature is not valid');
  }

  // Claims are only read after the signature holds, so nothing below is
  // acting on attacker-controlled data.
  const claims = decodeJwtSegment(payloadSegment, 'payload');
  const now = Math.floor(Date.now() / 1000);

  if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp)) {
    throw new Error('ID token is missing an expiry claim');
  }
  if (now >= claims.exp + ID_TOKEN_CLOCK_TOLERANCE_SECONDS) {
    throw new Error('ID token has expired');
  }
  if (claims.nbf !== undefined) {
    if (typeof claims.nbf !== 'number' || !Number.isFinite(claims.nbf)) {
      throw new Error('ID token has an unreadable nbf claim');
    }
    if (now < claims.nbf - ID_TOKEN_CLOCK_TOLERANCE_SECONDS) {
      throw new Error('ID token is not valid yet');
    }
  }
  if (claims.iss !== metadata.issuer) {
    throw new Error('ID token issuer does not match trusted CAS discovery metadata');
  }
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(CLIENT_ID)) {
    throw new Error('ID token audience does not include this client');
  }
  if (
    (claims.azp !== undefined && claims.azp !== CLIENT_ID) ||
    (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== CLIENT_ID)
  ) {
    throw new Error('ID token azp does not match this client');
  }
  if (claims.nonce !== nonce) {
    throw new Error('ID token nonce does not match the authorization transaction');
  }
  return claims;
}

// Request body reading

// Malformed or oversized bodies are the one failure the caller can actually
// fix, so they keep a 4xx instead of being flattened into a 500.
class BadRequestError extends Error {
  constructor(status, description) {
    super(description);
    this.name = 'BadRequestError';
    this.status = status;
    this.description = description;
  }
}

// Reads at most 32 kB and parses it as JSON. A body that never arrives, or one
// that is not declared application/json, resolves to undefined so the route
// guard answers with a clean 400 rather than half-trusting the input.
const readJsonBody = (req) => new Promise((resolve, reject) => {
  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const chunks = [];
  let size = 0;

  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_JSON_BODY_BYTES) {
      // Stop buffering but keep draining, the same way body-parser dumped an
      // over-limit stream. Nothing more is kept in memory, and the client is
      // still allowed to finish its upload so it can actually read the 413.
      req.removeAllListeners('data');
      req.resume();
      reject(new BadRequestError(413, 'The request body is larger than the 32kb limit.'));
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    if (size === 0 || contentType !== 'application/json') return resolve(undefined);
    try {
      resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } catch {
      reject(new BadRequestError(400, 'The request body could not be read as JSON.'));
    }
  });

  req.on('error', reject);
});

// Routes

export const createApp = ({ httpClient = casHttp, extras = {} } = {}) => {
const oidcMetadataCache = new Map();

// Same limit and window express-rate-limit enforced: 30 requests per minute per
// client on /oauth, counted per app instance the way its store was.
//
// The key is the socket peer address only. cloudflared reaches this server from
// localhost, so an X-Forwarded-For seen here is whatever the last hop wrote;
// honouring it would let any caller mint a fresh limit key per request just by
// sending a header. Only the local hop is trusted, and the local hop is the
// socket address.
//
// ponytail: a fixed in-memory window. A multi-instance deployment needs a
// shared counter, which is the same change the transaction store below needs.
const rateLimitHits = new Map();

const isRateLimited = (clientKey) => {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  for (const [key, timestamps] of rateLimitHits) {
    const live = timestamps.filter((at) => at > windowStart);
    if (live.length === 0) rateLimitHits.delete(key);
    else rateLimitHits.set(key, live);
  }
  const hits = rateLimitHits.get(clientKey) || [];
  hits.push(now);
  rateLimitHits.set(clientKey, hits);
  return hits.length > RATE_LIMIT_MAX_REQUESTS;
};

// path -> { METHOD: handler }. Six routes do not need a router library, and an
// explicit table is what makes the 404 and 405 answers below obvious.
const routes = new Map();
const route = (method, path, handler) => {
  routes.set(path, { ...routes.get(path), [method]: handler });
};

// Demo-only in-memory transaction storage. A production BFF must replace this
// with a shared durable store that supports atomic get-and-delete across nodes.
// Maps state -> immutable authorization transaction data.
const stateStore = new Map();

const evictOldestStates = () => {
  if (stateStore.size < MAX_STATE_STORE_ENTRIES) return;
  const sortedEntries = Array.from(stateStore.entries()).sort(
    (a, b) => a[1].createdAt - b[1].createdAt,
  );
  const removeCount = stateStore.size - MAX_STATE_STORE_ENTRIES + 1;
  for (let i = 0; i < removeCount; i += 1) {
    const [stateKey] = sortedEntries[i];
    stateStore.delete(stateKey);
  }
};

// The timer is intentionally unref'ed so importing this reference app in tests
// does not keep Node alive. Transactions also enforce expiry on read.
const stateCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [state, data] of stateStore.entries()) {
    if (now >= data.expiresAt) {
      stateStore.delete(state);
    }
  }
}, 10 * 60 * 1000);
stateCleanupTimer.unref?.();

const consumeTransaction = (state) => {
  const transaction = stateStore.get(state);
  if (!transaction || transaction.pending || transaction.expiresAt <= Date.now()) {
    stateStore.delete(state);
    return undefined;
  }
  // Synchronous get+delete makes the state single-use before any upstream await.
  stateStore.delete(state);
  return transaction;
};

/**
 * POST /oauth/par
 *
 * Start the sign-in flow. Your app sends the PKCE codeChallenge and URLs,
 * and this returns a requestUri that the SDK uses to build the authorization URL.
 *
 * Request:  { codeChallenge, codeChallengeMethod?, state?, nonce?, environment, redirectUri }
 * Response: { requestUri, expiresIn, state }
 */
route('POST', '/oauth/par', async (req, res) => {
  let reservedState;
  try {
    if (!hasJsonObjectBody(req)) {
      return rejectMissingBody(res);
    }

    const {
      codeChallenge,
      codeChallengeMethod = 'S256',
      state: providedState,
      nonce: providedNonce,
      redirectUri,
      scope,
    } = req.body;
    const { environment, authServerUrl } = resolveAuthServer(req.body.environment);

    // Generate secure random state/nonce when not provided.
    const state = providedState || generateOpaqueValue();
    const nonce = providedNonce || generateOpaqueValue();

    if (req.body.authServerUrl && req.body.authServerUrl !== authServerUrl) {
      return sendJson(res, 400, { error: 'authServerUrl override is not allowed; use environment only' });
    }

    if (!codeChallenge || !redirectUri) {
      return sendJson(res, 400, { error: 'codeChallenge and redirectUri are required' });
    }

    if (codeChallengeMethod !== 'S256') {
      return sendJson(res, 400, { error: 'codeChallengeMethod must be S256' });
    }

    if (!isValidCodeChallenge(codeChallenge)) {
      return sendJson(res, 400, { error: 'codeChallenge must be base64url and 43-128 chars (RFC 7636)' });
    }

    if (!hasLengthBetween(state, 8, MAX_STATE_LENGTH)) {
      return sendJson(res, 400, { error: `state must be 8-${MAX_STATE_LENGTH} characters` });
    }

    if (!hasLengthBetween(nonce, 8, MAX_NONCE_LENGTH)) {
      return sendJson(res, 400, { error: `nonce must be 8-${MAX_NONCE_LENGTH} characters` });
    }

    if (scope != null && !hasLengthBetween(scope, 1, MAX_SCOPE_LENGTH)) {
      return sendJson(res, 400, { error: `scope must be 1-${MAX_SCOPE_LENGTH} characters when provided` });
    }

    if (!(scope || SCOPE).split(/\s+/).includes('openid')) {
      return sendJson(res, 400, { error: 'scope must include openid for this sign-in flow' });
    }

    if (!isValidHttpsUrl(redirectUri)) {
      return sendJson(res, 400, { error: 'redirectUri must be a valid HTTPS URL' });
    }

    if (!isAllowedRedirectUri(redirectUri)) {
      return sendJson(res, 400, { error: 'redirectUri host is not in server allowlist' });
    }

    const existingTransaction = stateStore.get(state);
    if (existingTransaction && existingTransaction.expiresAt > Date.now()) {
      return sendJson(res, 409, { error: 'An authorization transaction already exists for this state' });
    }
    stateStore.delete(state);
    evictOldestStates();
    // Reserve the caller-provided state before the PAR network request. This
    // prevents concurrent PAR requests from overwriting a transaction.
    stateStore.set(state, {
      createdAt: Date.now(),
      expiresAt: Date.now() + AUTH_TRANSACTION_TTL_MS,
      pending: true,
    });
    reservedState = state;

    console.log('[PAR] request', {
      state: maskState(state),
      redirectUri,
      environment,
      authServerUrl,
      codeChallengeLength: codeChallenge?.length,
      scope: req.body.scope || SCOPE,
    });

    const parResponse = await pushAuthorizationRequest({
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      authServerUrl,
      redirectUri,
      scope,
    }, httpClient);

    const requestUri = parResponse.request_uri;
    const parExpiresIn = Number(parResponse.expires_in);
    const transactionTtlMs = Number.isFinite(parExpiresIn) && parExpiresIn > 0
      ? Math.min(AUTH_TRANSACTION_TTL_MS, parExpiresIn * 1000)
      : AUTH_TRANSACTION_TTL_MS;

    // Persist every value that must remain authoritative through token exchange.
    // Do not later use a caller-resubmitted redirect URI, environment, scope, or
    // PKCE challenge to build the token request.
    stateStore.set(state, {
      createdAt: Date.now(),
      expiresAt: Date.now() + transactionTtlMs,
      redirectUri,
      environment,
      authServerUrl,
      scope: scope || SCOPE,
      nonce,
      codeChallenge,
      codeChallengeMethod,
      clientId: CLIENT_ID,
      requestUri,
    });

    console.log('[PAR] response', {
      requestUriPresent: Boolean(requestUri),
      requestUriLength: requestUri?.length,
      expiresIn: parResponse.expires_in,
      state: maskState(state),
    });

    sendJson(res, 200, {
      requestUri,
      expiresIn: parResponse.expires_in,
      state,
    });
  } catch (err) {
    if (reservedState && stateStore.get(reservedState)?.pending) {
      stateStore.delete(reservedState);
    }
    if (err instanceof ValidationError) {
      return sendJson(res, 400, { error: err.message });
    }
    logSafeError('Error pushing authorization request:', err);
    sendUpstreamError(res, err, 'invalid_request');
  }
});

/**
 * POST /oauth/token
 *
 * Complete the sign-in flow. Your app sends the authorization code
 * and PKCE codeVerifier, and this returns the tokens.
 *
 * Request:  { code, codeVerifier, state }
 * Response: { accessToken, idToken, tokenType, expiresIn, refreshToken, scope }
 */
route('POST', '/oauth/token', async (req, res) => {
  try {
    if (!hasJsonObjectBody(req)) {
      return rejectMissingBody(res);
    }

    const allowedRequestFields = new Set(['code', 'codeVerifier', 'state']);
    if (Object.keys(req.body).some((field) => !allowedRequestFields.has(field))) {
      return sendJson(res, 400, { error: 'Only code, codeVerifier, and state are allowed' });
    }

    const { code, codeVerifier, state } = req.body;

    if (!code || !codeVerifier || !state) {
      return sendJson(res, 400, { error: 'code, codeVerifier, and state are required' });
    }

    if (!hasLengthBetween(code, 1, MAX_CODE_LENGTH)) {
      return sendJson(res, 400, { error: `code must be 1-${MAX_CODE_LENGTH} characters` });
    }

    if (!isValidCodeVerifier(codeVerifier)) {
      return sendJson(res, 400, { error: 'codeVerifier must be unreserved URI chars and 43-128 chars (RFC 7636)' });
    }

    if (!hasLengthBetween(state, 8, MAX_STATE_LENGTH)) {
      return sendJson(res, 400, { error: `state must be 8-${MAX_STATE_LENGTH} characters` });
    }

    // Atomically consume the transaction before any asynchronous work. This
    // prevents two concurrent token requests from exchanging the same code.
    const storedTransaction = consumeTransaction(state);
    if (!storedTransaction) {
      console.warn('[TOKEN] State validation failed: state not found', { state: maskState(state) });
      return sendJson(res, 400, { error: 'Invalid or expired state parameter' });
    }

    if (deriveS256Challenge(codeVerifier) !== storedTransaction.codeChallenge) {
      console.warn('[TOKEN] PKCE validation failed', { state: maskState(state) });
      return sendJson(res, 400, { error: 'Invalid PKCE code verifier' });
    }

    console.log('[TOKEN] request', {
      state: maskState(state),
      redirectUri: storedTransaction.redirectUri,
      environment: storedTransaction.environment,
      authServerUrl: storedTransaction.authServerUrl,
      codeVerifierLength: codeVerifier?.length,
    });

    const casTokens = await exchangeCodeForTokens({
      code,
      code_verifier: codeVerifier,
      authServerUrl: storedTransaction.authServerUrl,
      redirectUri: storedTransaction.redirectUri,
    }, httpClient);

    // A CAS response is not successful until its ID token is verified against
    // the selected environment's discovery document and transaction nonce.
    await verifyIdToken({
      idToken: casTokens.id_token,
      nonce: storedTransaction.nonce,
      authServerUrl: storedTransaction.authServerUrl,
    }, httpClient, oidcMetadataCache);

    // Map CAS snake_case response to app camelCase
    sendJson(res, 200, {
      accessToken: casTokens.access_token,
      tokenType: casTokens.token_type,
      expiresIn: casTokens.expires_in,
      refreshToken: casTokens.refresh_token,
      idToken: casTokens.id_token,
      scope: casTokens.scope,
    });
  } catch (err) {
    logSafeError('Error exchanging code for tokens:', err);
    sendUpstreamError(res, err, 'invalid_grant');
  }
});

// Both routes below accept a bare refresh token or revocable token with no
// session, cookie, bearer check, or CSRF protection: see the DEMO ONLY
// warnings in their JSDoc. They are opt-in and off by default so a copy-paste
// into a real integration does not inherit an unauthenticated CLIENT_SECRET
// proxy. Set DEMO_UNAUTHENTICATED_TOKEN_ROUTES=true to enable them for local
// demo use, the same way DEMO_EXTRAS gates the AASA/assetlinks routes above.
if (process.env.DEMO_UNAUTHENTICATED_TOKEN_ROUTES === 'true') {
  /**
   * POST /oauth/token/refresh
   *
   * Proxy token refresh requests to CAS.
   *
   * DEMO ONLY - THIS ROUTE IS DELIBERATELY UNAUTHENTICATED. DO NOT SHIP IT AS IS.
   *
   * There is no session, cookie, bearer check, or CSRF protection in front of it.
   * Anyone who can reach this endpoint can post any refresh token and this server
   * will attach CLIENT_SECRET and redeem it at CAS on their behalf. A refresh
   * token is inert against CAS without that secret, so this route is what makes a
   * stolen one usable: it lends the confidential client secret to any caller.
   *
   * A production deployment MUST instead:
   * 1. Bind the refresh token to a server-side session when /oauth/token succeeds.
   * 2. Never return the refresh token to the client (drop it from the response).
   * 3. Look the refresh token up from the authenticated session here rather than
   *    accepting one from the request body.
   */
  route('POST', '/oauth/token/refresh', async (req, res) => {
    try {
      if (!hasJsonObjectBody(req)) {
        return rejectMissingBody(res);
      }

      const { refreshToken, scope } = req.body;
      const { environment, authServerUrl } = resolveAuthServer(req.body.environment);

      if (req.body.authServerUrl && req.body.authServerUrl !== authServerUrl) {
        return sendJson(res, 400, { error: 'authServerUrl override is not allowed; use environment only' });
      }

      if (!refreshToken) {
        return sendJson(res, 400, { error: 'refreshToken is required' });
      }

      if (!hasLengthBetween(refreshToken, 10, MAX_TOKEN_LENGTH)) {
        return sendJson(res, 400, { error: `refreshToken must be 10-${MAX_TOKEN_LENGTH} characters` });
      }

      if (scope != null && !hasLengthBetween(scope, 1, MAX_SCOPE_LENGTH)) {
        return sendJson(res, 400, { error: `scope must be 1-${MAX_SCOPE_LENGTH} characters when provided` });
      }

      console.log('[REFRESH] request', {
        environment,
        authServerUrl,
        scope,
      });

      const casTokens = await refreshTokens({ refreshToken, scope, authServerUrl }, httpClient);

      // Map CAS snake_case response to app camelCase
      sendJson(res, 200, {
        accessToken: casTokens.access_token,
        tokenType: casTokens.token_type,
        expiresIn: casTokens.expires_in,
        refreshToken: casTokens.refresh_token,
        idToken: casTokens.id_token,
        scope: casTokens.scope,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        return sendJson(res, 400, { error: err.message });
      }
      logSafeError('Error refreshing tokens:', err);
      sendUpstreamError(res, err, 'invalid_grant');
    }
  });

  /**
   * POST /oauth/token/revoke
   *
   * Proxy token revocation requests to CAS.
   *
   * DEMO ONLY - THIS ROUTE IS DELIBERATELY UNAUTHENTICATED. DO NOT SHIP IT AS IS.
   *
   * Same gap as /oauth/token/refresh above, pointed the other way. There is no
   * session, cookie, bearer check, or CSRF protection here either, so anyone who
   * can reach this endpoint can post any token and this server will attach
   * CLIENT_SECRET and revoke it at CAS on their behalf. That is a denial-of-
   * service primitive against other people's sessions, not just a leak.
   *
   * A production deployment MUST instead:
   * 1. Bind the token to a server-side session when /oauth/token succeeds.
   * 2. Never return the refresh token to the client.
   * 3. Revoke only the token belonging to the caller's authenticated session,
   *    looked up server-side, rather than one accepted from the request body.
   */
  route('POST', '/oauth/token/revoke', async (req, res) => {
    try {
      if (!hasJsonObjectBody(req)) {
        return rejectMissingBody(res);
      }

      const { token, tokenTypeHint } = req.body;
      const { environment, authServerUrl } = resolveAuthServer(req.body.environment);

      if (req.body.authServerUrl && req.body.authServerUrl !== authServerUrl) {
        return sendJson(res, 400, { error: 'authServerUrl override is not allowed; use environment only' });
      }

      if (!token) {
        return sendJson(res, 400, { error: 'token is required' });
      }

      if (!hasLengthBetween(token, 10, MAX_TOKEN_LENGTH)) {
        return sendJson(res, 400, { error: `token must be 10-${MAX_TOKEN_LENGTH} characters` });
      }

      if (tokenTypeHint != null && tokenTypeHint !== 'access_token' && tokenTypeHint !== 'refresh_token') {
        return sendJson(res, 400, { error: 'tokenTypeHint must be access_token or refresh_token when provided' });
      }

      console.log('[REVOKE] request', {
        environment,
        authServerUrl,
        tokenTypeHint,
      });

      await revokeToken({ token, tokenTypeHint, authServerUrl }, httpClient);

      // Same 200 with a plain "OK" body the previous express handler sent, so
      // existing sample clients see no change on the wire.
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': 2 });
      res.end('OK');
    } catch (err) {
      if (err instanceof ValidationError) {
        return sendJson(res, 400, { error: err.message });
      }
      logSafeError('Error revoking token:', err);
      sendUpstreamError(res, err, 'invalid_request');
    }
  });
}

/**
 * GET /health
 */
route('GET', '/health', (req, res) => sendJson(res, 200, { status: 'ok' }));

// Demo-only AASA and assetlinks documents, registered only when DEMO_EXTRAS is on.
for (const [path, payload] of Object.entries(extras)) {
  route('GET', path, (req, res) => sendJson(res, 200, payload));
}

const server = http.createServer(async (req, res) => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }

  const path = (req.url || '/').split('?')[0];
  const isOAuthPath = path === '/oauth' || path.startsWith('/oauth/');
  if (isOAuthPath) {
    // Prevent auth responses from being cached by intermediaries.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
  }

  try {
    if (isOAuthPath && isRateLimited(req.socket.remoteAddress || 'unknown')) {
      res.setHeader('Retry-After', String(RATE_LIMIT_WINDOW_MS / 1000));
      return sendOAuthError(res, 429, 'temporarily_unavailable', 'Too many requests. Retry later.');
    }

    const handlers = routes.get(path);
    if (!handlers) {
      return sendJson(res, 404, { error: 'not_found', error_description: 'Unknown endpoint.' });
    }
    // HEAD is answered by the GET handler; node:http drops the body itself.
    const handler = handlers[req.method === 'HEAD' ? 'GET' : req.method];
    if (!handler) {
      res.setHeader('Allow', Object.keys(handlers).join(', '));
      return sendJson(res, 405, {
        error: 'method_not_allowed',
        error_description: 'This endpoint does not accept that method.',
      });
    }

    if (req.method === 'POST') {
      req.body = await readJsonBody(req);
    }
    await handler(req, res);
  } catch (err) {
    if (err instanceof BadRequestError) {
      return sendOAuthError(res, err.status, 'invalid_request', err.description);
    }
    // Terminal handler. The routes catch their own failures, so nothing should
    // reach here, but without it a throw leaves the socket hanging until it
    // times out, and any message it carries must not reach the client.
    logSafeError('Unhandled request error:', err);
    if (res.headersSent) return res.end();
    return sendOAuthError(res, 500, 'server_error', 'The request could not be completed.');
  }
});

return server;
};

// Startup

// ALLOWED_REDIRECT_HOSTS is required, not optional. isAllowedRedirectUri fails
// closed, so an unset value would reject every PAR at runtime instead of at
// boot. Refuse to start and say so rather than look healthy and serve 400s.
const REQUIRED = ['CLIENT_ID', 'CLIENT_SECRET', 'RSA_PRIVATE_KEY', 'ALLOWED_REDIRECT_HOSTS'];
const missing = REQUIRED.filter((key) => !process.env[key]);

const isDirectExecution = process.argv[1] && new URL(import.meta.url).pathname === process.argv[1];
if (isDirectExecution) {
  if (missing.length) {
    console.error(`Missing env vars: ${missing.join(', ')}`);
    console.error('Copy .env.example to .env and fill in the values.');
    process.exit(1);
  }

  const app = createApp({
    extras: process.env.DEMO_EXTRAS === 'true' ? resolveExtrasRoutes() : {},
  });

  if (HOST !== '127.0.0.1') {
    console.warn(
      '[WARN] This reference server is intended for trusted dev environments only.'
    );
  }

  app.listen(PORT, HOST, () => {
    console.log(`KRDPASS Demo Server: http://${HOST}:${PORT}`);
  });
}
