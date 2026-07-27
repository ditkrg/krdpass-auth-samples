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
 */

import axios from 'axios';
import crypto from 'crypto';
import 'dotenv/config';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { setupExtrasRoutes } from './extras.js';
// -------------------------------------------------------------
// Configuration
// -------------------------------------------------------------

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
const CAS_HTTP_TIMEOUT_MS = Number(process.env.CAS_HTTP_TIMEOUT_MS) || 10000;
const AUTH_TRANSACTION_TTL_MS = Math.min(
  Math.max(Number(process.env.AUTH_TRANSACTION_TTL_MS) || 5 * 60 * 1000, 30 * 1000),
  10 * 60 * 1000,
);
const OIDC_METADATA_CACHE_TTL_MS = Math.min(
  Math.max(Number(process.env.OIDC_METADATA_CACHE_TTL_MS) || 60 * 60 * 1000, 60 * 1000),
  24 * 60 * 60 * 1000,
);
const ID_TOKEN_ALGORITHMS = ['RS256', 'RS384', 'RS512'];

// Shared HTTP client for CAS calls with a hard timeout so a slow or
// unresponsive upstream cannot pile up open sockets and hang the server.
const casHttp = axios.create({ timeout: CAS_HTTP_TIMEOUT_MS });

// -------------------------------------------------------------
// Logging helpers
// -------------------------------------------------------------
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
  const status = err?.response?.status;
  const responseData = err?.response?.data;
  const endpoint = err?.config?.url;
  const method = err?.config?.method?.toUpperCase();
  const responseError = typeof responseData?.error === 'string' ? responseData.error : undefined;
  const responseErrorDescription =
    typeof responseData?.error_description === 'string' ? responseData.error_description : undefined;

  return {
    name: err?.name,
    message: err?.message,
    code: err?.code,
    status,
    endpoint,
    method,
    responseError,
    responseErrorDescription,
  };
};

const logSafeError = (message, err) => {
  console.error(message, sanitizeErrorForLog(err));
};


const isAllowedRedirectUri = (redirectUri) => {
  if (REDIRECT_HOST_ALLOWLIST.length === 0) return true;
  try {
    const parsed = new URL(String(redirectUri));
    return REDIRECT_HOST_ALLOWLIST.includes((parsed.host || '').toLowerCase());
  } catch {
    return false;
  }
};

const resolveAuthServer = (environmentValue) => {
  if (environmentValue == null || String(environmentValue).trim() === '') {
    throw new Error('environment is required and must be one of: production, development');
  }
  const normalized = CANONICAL_ENV_BY_ALIAS[String(environmentValue).trim().toLowerCase()];
  const authServerUrl = AUTH_SERVER_BY_ENV[normalized];
  if (!authServerUrl) {
    throw new Error('environment must be one of: production, development');
  }
  return {
    environment: normalized,
    authServerUrl,
  };
};

// -------------------------------------------------------------
// OAuth Functions
// -------------------------------------------------------------

/**
 * Creates a signed JWT containing the OAuth request parameters.
 * CAS requires requests to be signed with your private key (JAR/RFC 9101).
 */
function createSignedRequestJwt(params, authServerUrl) {
  return jwt.sign(
    {
      ...params,
      iss: CLIENT_ID,
      aud: authServerUrl,
      iat: Math.floor(Date.now() / 1000),
      jti: crypto.randomUUID(),
    },
    RSA_PRIVATE_KEY,
    { algorithm: 'RS256', expiresIn: '5m' }
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

  console.log('[CAS PAR] Response status:', 200);
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

const getSigningKey = async (jwksUri, keyId, algorithm, httpClient = casHttp) => {
  if (!keyId) throw new Error('ID token is missing a key id');
  const { data } = await httpClient.get(jwksUri);
  const jwk = data?.keys?.find((key) =>
    key.kid === keyId && key.kty === 'RSA' && key.use !== 'enc' && (!key.alg || key.alg === algorithm),
  );
  if (!jwk) throw new Error('No matching signing key was found in CAS JWKS');
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
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

  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded?.header || !ID_TOKEN_ALGORITHMS.includes(decoded.header.alg)) {
    throw new Error('ID token uses an unsupported signing algorithm');
  }

  const metadata = await getOidcMetadata(authServerUrl, httpClient, metadataCache);
  const signingKey = await getSigningKey(metadata.jwksUri, decoded.header.kid, decoded.header.alg, httpClient);
  const claims = jwt.verify(idToken, signingKey, {
    algorithms: ID_TOKEN_ALGORITHMS,
    issuer: metadata.issuer,
    audience: CLIENT_ID,
    clockTolerance: 30,
  });

  if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp)) {
    throw new Error('ID token is missing an expiry claim');
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

// -------------------------------------------------------------
// Routes
// -------------------------------------------------------------

export const createApp = ({ httpClient = casHttp } = {}) => {
const app = express();
const oidcMetadataCache = new Map();
// cloudflared reaches this BFF from localhost and forwards the original client
// address in X-Forwarded-For. Trust only that local proxy hop; do not trust
// arbitrary proxy chains or client-supplied forwarding headers.
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '32kb' }));
app.use('/oauth', rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
}));
app.use((req, res, next) => {
  if (req.path.startsWith('/oauth/')) {
    // Prevent auth responses from being cached by intermediaries.
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
  }
  next();
});

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
app.post('/oauth/par', async (req, res) => {
  let reservedState;
  try {
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
      return res.status(400).json({ error: 'authServerUrl override is not allowed; use environment only' });
    }

    if (!codeChallenge || !redirectUri) {
      return res.status(400).json({ error: 'codeChallenge, environment, and redirectUri are required' });
    }

    if (codeChallengeMethod !== 'S256') {
      return res.status(400).json({ error: 'codeChallengeMethod must be S256' });
    }

    if (!isValidCodeChallenge(codeChallenge)) {
      return res.status(400).json({ error: 'codeChallenge must be base64url and 43-128 chars (RFC 7636)' });
    }

    if (!hasLengthBetween(state, 8, MAX_STATE_LENGTH)) {
      return res.status(400).json({ error: `state must be 8-${MAX_STATE_LENGTH} characters` });
    }

    if (!hasLengthBetween(nonce, 8, MAX_NONCE_LENGTH)) {
      return res.status(400).json({ error: `nonce must be 8-${MAX_NONCE_LENGTH} characters` });
    }

    if (scope != null && !hasLengthBetween(scope, 1, MAX_SCOPE_LENGTH)) {
      return res.status(400).json({ error: `scope must be 1-${MAX_SCOPE_LENGTH} characters when provided` });
    }

    if (!(scope || SCOPE).split(/\s+/).includes('openid')) {
      return res.status(400).json({ error: 'scope must include openid for this sign-in flow' });
    }

    if (!isValidHttpsUrl(redirectUri)) {
      return res.status(400).json({ error: 'redirectUri must be a valid HTTPS URL' });
    }

    if (!isAllowedRedirectUri(redirectUri)) {
      return res.status(400).json({ error: 'redirectUri host is not in server allowlist' });
    }

    const existingTransaction = stateStore.get(state);
    if (existingTransaction && existingTransaction.expiresAt > Date.now()) {
      return res.status(409).json({ error: 'An authorization transaction already exists for this state' });
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

    res.json({
      requestUri,
      expiresIn: parResponse.expires_in,
      state,
    });
  } catch (err) {
    if (reservedState && stateStore.get(reservedState)?.pending) {
      stateStore.delete(reservedState);
    }
    if (typeof err.message === 'string' && err.message.startsWith('environment')) {
      return res.status(400).json({ error: err.message });
    }
    logSafeError('Error pushing authorization request:', err);
    const status = err.response?.status || 500;
    const error = err.response?.data || { error: err.message };
    res.status(status).json(error);
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
app.post('/oauth/token', async (req, res) => {
  try {
    const allowedRequestFields = new Set(['code', 'codeVerifier', 'state']);
    if (
      !req.body ||
      typeof req.body !== 'object' ||
      Array.isArray(req.body) ||
      Object.keys(req.body).some((field) => !allowedRequestFields.has(field))
    ) {
      return res.status(400).json({ error: 'Only code, codeVerifier, and state are allowed' });
    }

    const { code, codeVerifier, state } = req.body;

    if (!code || !codeVerifier || !state) {
      return res.status(400).json({ error: 'code, codeVerifier, and state are required' });
    }

    if (!hasLengthBetween(code, 1, MAX_CODE_LENGTH)) {
      return res.status(400).json({ error: `code must be 1-${MAX_CODE_LENGTH} characters` });
    }

    if (!isValidCodeVerifier(codeVerifier)) {
      return res.status(400).json({ error: 'codeVerifier must be unreserved URI chars and 43-128 chars (RFC 7636)' });
    }

    if (!hasLengthBetween(state, 8, MAX_STATE_LENGTH)) {
      return res.status(400).json({ error: `state must be 8-${MAX_STATE_LENGTH} characters` });
    }

    // Atomically consume the transaction before any asynchronous work. This
    // prevents two concurrent token requests from exchanging the same code.
    const storedTransaction = consumeTransaction(state);
    if (!storedTransaction) {
      console.warn('[TOKEN] State validation failed: state not found', { state: maskState(state) });
      return res.status(400).json({ error: 'Invalid or expired state parameter' });
    }

    if (storedTransaction.clientId !== CLIENT_ID || deriveS256Challenge(codeVerifier) !== storedTransaction.codeChallenge) {
      console.warn('[TOKEN] PKCE validation failed', { state: maskState(state) });
      return res.status(400).json({ error: 'Invalid PKCE code verifier' });
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
    const appTokens = {
      accessToken: casTokens.access_token,
      tokenType: casTokens.token_type,
      expiresIn: casTokens.expires_in,
      refreshToken: casTokens.refresh_token,
      idToken: casTokens.id_token,
      scope: casTokens.scope,
    };

    res.json(appTokens);
  } catch (err) {
    logSafeError('Error exchanging code for tokens:', err);
    const status = err.response?.status || 500;
    const error = err.response?.data || { error: err.message };
    res.status(status).json(error);
  }
});

/**
 * POST /oauth/token/refresh
 *
 * Proxy token refresh requests to CAS.
 */
app.post('/oauth/token/refresh', async (req, res) => {
  try {
    const { refreshToken, scope } = req.body;
    const { environment, authServerUrl } = resolveAuthServer(req.body.environment);

    if (req.body.authServerUrl && req.body.authServerUrl !== authServerUrl) {
      return res.status(400).json({ error: 'authServerUrl override is not allowed; use environment only' });
    }

    if (!refreshToken) {
      return res.status(400).json({ error: 'refreshToken is required' });
    }

    if (!hasLengthBetween(refreshToken, 10, MAX_TOKEN_LENGTH)) {
      return res.status(400).json({ error: `refreshToken must be 10-${MAX_TOKEN_LENGTH} characters` });
    }

    if (scope != null && !hasLengthBetween(scope, 1, MAX_SCOPE_LENGTH)) {
      return res.status(400).json({ error: `scope must be 1-${MAX_SCOPE_LENGTH} characters when provided` });
    }

    console.log('[REFRESH] request', {
      environment,
      authServerUrl,
      scope,
    });

    const casTokens = await refreshTokens({ refreshToken, scope, authServerUrl }, httpClient);

    // Map CAS snake_case response to app camelCase
    const appTokens = {
      accessToken: casTokens.access_token,
      tokenType: casTokens.token_type,
      expiresIn: casTokens.expires_in,
      refreshToken: casTokens.refresh_token,
      idToken: casTokens.id_token,
      scope: casTokens.scope,
    };

    res.json(appTokens);
  } catch (err) {
    if (typeof err.message === 'string' && err.message.startsWith('environment')) {
      return res.status(400).json({ error: err.message });
    }
    logSafeError('Error refreshing tokens:', err);
    const status = err.response?.status || 500;
    const error = err.response?.data || { error: err.message };
    res.status(status).json(error);
  }
});

/**
 * POST /oauth/token/revoke
 *
 * Proxy token revocation requests to CAS.
 */
app.post('/oauth/token/revoke', async (req, res) => {
  try {
    const { token, tokenTypeHint } = req.body;
    const { environment, authServerUrl } = resolveAuthServer(req.body.environment);

    if (req.body.authServerUrl && req.body.authServerUrl !== authServerUrl) {
      return res.status(400).json({ error: 'authServerUrl override is not allowed; use environment only' });
    }

    if (!token) {
      return res.status(400).json({ error: 'token is required' });
    }

    if (!hasLengthBetween(token, 10, MAX_TOKEN_LENGTH)) {
      return res.status(400).json({ error: `token must be 10-${MAX_TOKEN_LENGTH} characters` });
    }

    if (tokenTypeHint != null && tokenTypeHint !== 'access_token' && tokenTypeHint !== 'refresh_token') {
      return res.status(400).json({ error: 'tokenTypeHint must be access_token or refresh_token when provided' });
    }

    console.log('[REVOKE] request', {
      environment,
      authServerUrl,
      tokenTypeHint,
    });

    await revokeToken({ token, tokenTypeHint, authServerUrl }, httpClient);

    res.sendStatus(200);
  } catch (err) {
    if (typeof err.message === 'string' && err.message.startsWith('environment')) {
      return res.status(400).json({ error: err.message });
    }
    logSafeError('Error revoking token:', err);
    const status = err.response?.status || 500;
    const error = err.response?.data || { error: err.message };
    res.status(status).json(error);
  }
});

/**
 * GET /health
 */
app.get('/health', (req, res) => res.json({ status: 'ok' }));

return app;
};

// -------------------------------------------------------------
// Startup
// -------------------------------------------------------------

const REQUIRED = ['CLIENT_ID', 'CLIENT_SECRET', 'RSA_PRIVATE_KEY'];
const missing = REQUIRED.filter((key) => !process.env[key]);

const isDirectExecution = process.argv[1] && new URL(import.meta.url).pathname === process.argv[1];
if (isDirectExecution) {
  if (missing.length) {
    console.error(`Missing env vars: ${missing.join(', ')}`);
    console.error('Copy .env.example to .env and fill in the values.');
    process.exit(1);
  }

  const app = createApp();
  if (process.env.DEMO_EXTRAS === 'true') {
    setupExtrasRoutes(app);
  }

  if (HOST !== '127.0.0.1') {
    console.warn(
      '[WARN] This reference server is intended for trusted dev environments only.'
    );
  }

  app.listen(PORT, HOST, () => {
    console.log(`KRDPASS Demo Server: http://${HOST}:${PORT}`);
  });
}
