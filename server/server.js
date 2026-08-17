/**
 * KRDPASS demo server: a zero-dependency Node reference for "Sign in with
 * KRDPASS" using PAR (RFC 9126) and JAR (RFC 9101). The routes live here;
 * ./support.js holds configuration and the response helpers, and ./cas.js
 * holds the CAS client, JAR signing, and ID token verification.
 */

import crypto from 'node:crypto';
import http from 'node:http';

import { resolveExtrasRoutes } from './extras.js';
import {
  casHttp,
  deriveS256Challenge,
  exchangeCodeForTokens,
  pushAuthorizationRequest,
  refreshTokens,
  revokeToken,
  verifyIdToken,
} from './cas.js';
import {
  AUTH_SERVER_BY_ENV,
  AUTH_TRANSACTION_TTL_MS,
  BadRequestError,
  CANONICAL_ENV_BY_ALIAS,
  HOST,
  MAX_CODE_LENGTH,
  MAX_GRANT_SCOPE_ENTRIES,
  MAX_NONCE_LENGTH,
  MAX_SCOPE_LENGTH,
  MAX_STATE_LENGTH,
  MAX_STATE_STORE_ENTRIES,
  MAX_TOKEN_LENGTH,
  PKCE_CODE_CHALLENGE_REGEX,
  PKCE_CODE_VERIFIER_REGEX,
  PORT,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
  SCOPE,
  SECURITY_HEADERS,
  hasJsonObjectBody,
  isAllowedRedirectUri,
  logSafeError,
  maskState,
  readJsonBody,
  rejectMissingBody,
  sendJson,
  sendOAuthError,
  sendUpstreamError,
} from './support.js';

// A caller-caused input problem that never reached CAS. Routes check
// `instanceof ValidationError` and answer 400 with the error's own message.
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

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

// timingSafeEqual throws on a length mismatch, so lengths short-circuit first.
// That leaks only the challenge length, which is public in the PAR request
// anyway; the value itself is compared in constant time.
const equalsConstantTime = (left, right) => {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// A refresh must never widen a grant. No requested scope means "the grant as
// issued" (RFC 6749 section 6), so undefined stays omitted upstream. A request
// disjoint from the known grant narrows to '' and CAS answers invalid_scope;
// falling back to the grant would return more than the caller asked for.
const constrainScope = (requested, granted) => {
  if (!requested) return undefined;
  if (!granted) return requested;
  const allowed = new Set(granted.split(/\s+/).filter(Boolean));
  return requested.split(/\s+/).filter((value) => allowed.has(value)).join(' ');
};

const resolveAuthServer = (environmentValue, requestedAuthServerUrl) => {
  if (environmentValue == null || String(environmentValue).trim() === '') {
    throw new ValidationError('environment is required and must be one of: production, development');
  }
  const normalized = CANONICAL_ENV_BY_ALIAS[String(environmentValue).trim().toLowerCase()];
  const authServerUrl = AUTH_SERVER_BY_ENV[normalized];
  if (!authServerUrl) {
    throw new ValidationError('environment must be one of: production, development');
  }
  // A caller-supplied authServerUrl that differs from the environment's own
  // would redirect the whole token exchange, so it is refused.
  if (requestedAuthServerUrl && requestedAuthServerUrl !== authServerUrl) {
    throw new ValidationError('authServerUrl override is not allowed; use environment only');
  }
  return {
    environment: normalized,
    authServerUrl,
  };
};

// CAS snake_case mapped to the camelCase the SDKs parse. Shared by the
// exchange and refresh routes so the two cannot drift.
const sendTokens = (res, casTokens) =>
  sendJson(res, 200, {
    accessToken: casTokens.access_token,
    tokenType: casTokens.token_type,
    expiresIn: casTokens.expires_in,
    refreshToken: casTokens.refresh_token,
    idToken: casTokens.id_token,
    scope: casTokens.scope,
  });

export const createApp = ({ httpClient = casHttp, extras = {} } = {}) => {
// Per process, not shared across instances: discovery metadata by auth server
// URL, and the imported JWKS signing keys by JWKS URI.
const caches = { metadata: new Map(), signingKeys: new Map() };

// In-memory rate limit keyed by socket peer address. Behind a reverse proxy
// every request arrives from localhost, so this collapses to one global bucket;
// trusting X-Forwarded-For would be worse, since a caller can mint a fresh key
// per request. A real deployment reads the client address at a trusted-proxy
// hop count and shares the counter across instances.
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

// path -> { METHOD: handler }. An explicit table is what makes the 404 and 405
// answers below obvious.
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

// sha256(refresh token) -> scope CAS granted, learned at token exchange and
// used to constrain the refresh route. Hashed so the map is not a second copy
// of the credential. Best effort and empty after a restart; CAS enforces the
// grant on every refresh whether or not this process remembers it: this map
// demonstrates where a BFF hangs its down-scoping, it is not the control.
const grantedScopes = new Map();

const tokenFingerprint = (token) =>
  crypto.createHash('sha256').update(String(token)).digest('base64url');

const rememberGrantedScope = (refreshToken, scope) => {
  if (!refreshToken || !scope) return;
  // Map iterates in insertion order, so the first key is the oldest.
  while (grantedScopes.size >= MAX_GRANT_SCOPE_ENTRIES) {
    grantedScopes.delete(grantedScopes.keys().next().value);
  }
  grantedScopes.set(tokenFingerprint(refreshToken), scope);
};

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
    const { environment, authServerUrl } = resolveAuthServer(req.body.environment, req.body.authServerUrl);

    const state = providedState || generateOpaqueValue();
    const nonce = providedNonce || generateOpaqueValue();

    if (!codeChallenge || !redirectUri) {
      return sendOAuthError(res, 400, 'invalid_request', 'codeChallenge and redirectUri are required');
    }

    if (codeChallengeMethod !== 'S256') {
      return sendOAuthError(res, 400, 'invalid_request', 'codeChallengeMethod must be S256');
    }

    if (!isValidCodeChallenge(codeChallenge)) {
      return sendOAuthError(res, 400, 'invalid_request', 'codeChallenge must be base64url and 43-128 chars (RFC 7636)');
    }

    if (!hasLengthBetween(state, 8, MAX_STATE_LENGTH)) {
      return sendOAuthError(res, 400, 'invalid_request', `state must be 8-${MAX_STATE_LENGTH} characters`);
    }

    if (!hasLengthBetween(nonce, 8, MAX_NONCE_LENGTH)) {
      return sendOAuthError(res, 400, 'invalid_request', `nonce must be 8-${MAX_NONCE_LENGTH} characters`);
    }

    if (scope != null && !hasLengthBetween(scope, 1, MAX_SCOPE_LENGTH)) {
      return sendOAuthError(res, 400, 'invalid_scope', `scope must be 1-${MAX_SCOPE_LENGTH} characters when provided`);
    }

    if (!(scope || SCOPE).split(/\s+/).includes('openid')) {
      return sendOAuthError(res, 400, 'invalid_scope', 'scope must include openid for this sign-in flow');
    }

    if (!isValidHttpsUrl(redirectUri)) {
      return sendOAuthError(res, 400, 'invalid_request', 'redirectUri must be a valid HTTPS URL');
    }

    if (!isAllowedRedirectUri(redirectUri)) {
      return sendOAuthError(res, 400, 'invalid_request', 'redirectUri host is not in server allowlist');
    }

    const existingTransaction = stateStore.get(state);
    if (existingTransaction && existingTransaction.expiresAt > Date.now()) {
      return sendOAuthError(res, 409, 'invalid_request', 'An authorization transaction already exists for this state');
    }
    stateStore.delete(state);
    evictOldestStates();
    // Reserve the state before the PAR network request, so concurrent PAR
    // requests cannot overwrite a transaction.
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

    // Persist every value that must remain authoritative through token
    // exchange; the token request is never built from caller-resubmitted values.
    stateStore.set(state, {
      createdAt: Date.now(),
      expiresAt: Date.now() + transactionTtlMs,
      redirectUri,
      environment,
      authServerUrl,
      scope: scope || SCOPE,
      nonce,
      codeChallenge,
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
      return sendOAuthError(res, 400, 'invalid_request', err.message);
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
      return sendOAuthError(res, 400, 'invalid_request', 'Only code, codeVerifier, and state are allowed');
    }

    const { code, codeVerifier, state } = req.body;

    if (!code || !codeVerifier || !state) {
      return sendOAuthError(res, 400, 'invalid_request', 'code, codeVerifier, and state are required');
    }

    if (!hasLengthBetween(code, 1, MAX_CODE_LENGTH)) {
      return sendOAuthError(res, 400, 'invalid_request', `code must be 1-${MAX_CODE_LENGTH} characters`);
    }

    if (!isValidCodeVerifier(codeVerifier)) {
      return sendOAuthError(res, 400, 'invalid_request', 'codeVerifier must be unreserved URI chars and 43-128 chars (RFC 7636)');
    }

    if (!hasLengthBetween(state, 8, MAX_STATE_LENGTH)) {
      return sendOAuthError(res, 400, 'invalid_request', `state must be 8-${MAX_STATE_LENGTH} characters`);
    }

    // Atomically consume the transaction before any asynchronous work. This
    // prevents two concurrent token requests from exchanging the same code.
    const storedTransaction = consumeTransaction(state);
    if (!storedTransaction) {
      console.warn('[TOKEN] State validation failed: state not found', { state: maskState(state) });
      return sendOAuthError(res, 400, 'invalid_grant', 'Invalid or expired state parameter');
    }

    if (!equalsConstantTime(deriveS256Challenge(codeVerifier), storedTransaction.codeChallenge)) {
      console.warn('[TOKEN] PKCE validation failed', { state: maskState(state) });
      return sendOAuthError(res, 400, 'invalid_grant', 'Invalid PKCE code verifier');
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
    }, httpClient, caches);

    rememberGrantedScope(casTokens.refresh_token, casTokens.scope || storedTransaction.scope);

    sendTokens(res, casTokens);
  } catch (err) {
    logSafeError('Error exchanging code for tokens:', err);
    sendUpstreamError(res, err, 'invalid_grant');
  }
});

// The routes below are off by default so a copy-paste into a real integration
// does not inherit an unauthenticated CLIENT_SECRET proxy: see the DEMO ONLY
// warnings. Set DEMO_UNAUTHENTICATED_TOKEN_ROUTES=true for local demo use.
if (process.env.DEMO_UNAUTHENTICATED_TOKEN_ROUTES === 'true') {
  /**
   * POST /oauth/token/refresh
   *
   * DEMO ONLY - DELIBERATELY UNAUTHENTICATED. DO NOT SHIP IT AS IS: anyone who
   * can reach it can post any refresh token and this server will attach
   * CLIENT_SECRET and redeem it at CAS. A production deployment MUST bind the
   * refresh token to a server-side session at /oauth/token, never return it to
   * the client, and look it up from the authenticated session here.
   */
  route('POST', '/oauth/token/refresh', async (req, res) => {
    try {
      if (!hasJsonObjectBody(req)) {
        return rejectMissingBody(res);
      }

      const { refreshToken, scope } = req.body;
      const { environment, authServerUrl } = resolveAuthServer(req.body.environment, req.body.authServerUrl);

      if (!refreshToken) {
        return sendOAuthError(res, 400, 'invalid_request', 'refreshToken is required');
      }

      if (!hasLengthBetween(refreshToken, 10, MAX_TOKEN_LENGTH)) {
        return sendOAuthError(res, 400, 'invalid_request', `refreshToken must be 10-${MAX_TOKEN_LENGTH} characters`);
      }

      if (scope != null && !hasLengthBetween(scope, 1, MAX_SCOPE_LENGTH)) {
        return sendOAuthError(res, 400, 'invalid_scope', `scope must be 1-${MAX_SCOPE_LENGTH} characters when provided`);
      }

      const grantedScope = grantedScopes.get(tokenFingerprint(refreshToken));
      const effectiveScope = constrainScope(scope, grantedScope);

      console.log('[REFRESH] request', {
        environment,
        authServerUrl,
        scope: effectiveScope,
        grantIsKnown: Boolean(grantedScope),
      });

      const casTokens = await refreshTokens({ refreshToken, scope: effectiveScope, authServerUrl }, httpClient);

      // A refresh response need not carry an id_token. One that does gets every
      // check the sign-in token gets except the nonce, which has no
      // authorization transaction here to bind to.
      if (casTokens.id_token) {
        await verifyIdToken({ idToken: casTokens.id_token, authServerUrl }, httpClient, caches);
      }

      // Refresh tokens rotate, so the grant follows the token that replaces it.
      // The grantedScope fallback keeps it across a refresh that sent no scope
      // and got none back.
      grantedScopes.delete(tokenFingerprint(refreshToken));
      rememberGrantedScope(casTokens.refresh_token, casTokens.scope || effectiveScope || grantedScope);

      sendTokens(res, casTokens);
    } catch (err) {
      if (err instanceof ValidationError) {
        return sendOAuthError(res, 400, 'invalid_request', err.message);
      }
      logSafeError('Error refreshing tokens:', err);
      sendUpstreamError(res, err, 'invalid_grant');
    }
  });

  /**
   * POST /oauth/token/revoke
   *
   * DEMO ONLY - DELIBERATELY UNAUTHENTICATED. DO NOT SHIP IT AS IS: anyone who
   * can reach it can revoke any token with this server's CLIENT_SECRET, a
   * denial-of-service primitive against other people's sessions. A production
   * deployment MUST revoke only the token belonging to the caller's
   * authenticated session, looked up server-side.
   */
  route('POST', '/oauth/token/revoke', async (req, res) => {
    try {
      if (!hasJsonObjectBody(req)) {
        return rejectMissingBody(res);
      }

      const { token, tokenTypeHint } = req.body;
      const { environment, authServerUrl } = resolveAuthServer(req.body.environment, req.body.authServerUrl);

      if (!token) {
        return sendOAuthError(res, 400, 'invalid_request', 'token is required');
      }

      if (!hasLengthBetween(token, 10, MAX_TOKEN_LENGTH)) {
        return sendOAuthError(res, 400, 'invalid_request', `token must be 10-${MAX_TOKEN_LENGTH} characters`);
      }

      if (tokenTypeHint != null && tokenTypeHint !== 'access_token' && tokenTypeHint !== 'refresh_token') {
        return sendOAuthError(res, 400, 'invalid_request', 'tokenTypeHint must be access_token or refresh_token when provided');
      }

      console.log('[REVOKE] request', {
        environment,
        authServerUrl,
        tokenTypeHint,
      });

      await revokeToken({ token, tokenTypeHint, authServerUrl }, httpClient);

      // RFC 7009 says a revocation response carries no useful body, and the
      // sample clients only check the status.
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': 2 });
      res.end('OK');
    } catch (err) {
      if (err instanceof ValidationError) {
        return sendOAuthError(res, 400, 'invalid_request', err.message);
      }
      logSafeError('Error revoking token:', err);
      sendUpstreamError(res, err, 'invalid_request');
    }
  });
}

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
    // Terminal handler: without it a stray throw leaves the socket hanging, and
    // any message it carries must not reach the client.
    logSafeError('Unhandled request error:', err);
    if (res.headersSent) return res.end();
    return sendOAuthError(res, 500, 'server_error', 'The request could not be completed.');
  }
});

return server;
};

// ALLOWED_REDIRECT_HOSTS is required: isAllowedRedirectUri fails closed, so an
// unset value would look healthy and reject every PAR. Refuse to start instead.
const REQUIRED = ['CLIENT_ID', 'CLIENT_SECRET', 'RSA_PRIVATE_KEY', 'ALLOWED_REDIRECT_HOSTS'];
const missing = REQUIRED.filter((key) => !process.env[key]);

// Both sides are decoded filesystem paths. Comparing a URL pathname instead
// would fail for any checkout under a directory with a space or '#' in its name.
const isDirectExecution = process.argv[1] && import.meta.filename === process.argv[1];
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
