/**
 * Shared plumbing for the KRDPASS demo server: configuration read from the
 * environment (CLIENT_SECRET and the RSA signing key included), the JSON
 * response and OAuth error helpers, request body reading, and log redaction.
 * server.js owns the routes; nothing here talks to CAS.
 *
 * The UpstreamError import from ./cas.js is a deliberate cycle: both sides
 * only touch the other's bindings inside function bodies, never at top level.
 */

import { UpstreamError } from './cas.js';

// Configuration

export const CLIENT_ID = process.env.CLIENT_ID;
export const CLIENT_SECRET = process.env.CLIENT_SECRET;
export const SCOPE = (process.env.DEFAULT_SCOPE || 'openid profile').trim();
export const RSA_PRIVATE_KEY = process.env.RSA_PRIVATE_KEY?.replace(/\\n/g, '\n');
export const HOST = process.env.HOST || '127.0.0.1';
export const PORT = process.env.PORT || 3000;

const REDIRECT_HOST_ALLOWLIST = (process.env.ALLOWED_REDIRECT_HOSTS || '')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);
export const AUTH_SERVER_BY_ENV = Object.freeze({
  production: 'https://account.id.krd',
  development: 'https://auth.dev.krd',
});
export const CANONICAL_ENV_BY_ALIAS = Object.freeze({
  production: 'production',
  prod: 'production',
  development: 'development',
  dev: 'development',
});
export const PKCE_CODE_CHALLENGE_REGEX = /^[A-Za-z0-9_-]{43,128}$/;
export const PKCE_CODE_VERIFIER_REGEX = /^[A-Za-z0-9._~-]{43,128}$/;
export const MAX_SCOPE_LENGTH = 512;
export const MAX_STATE_LENGTH = 256;
export const MAX_NONCE_LENGTH = 256;
export const MAX_CODE_LENGTH = 4096;
export const MAX_TOKEN_LENGTH = 8192;
export const MAX_STATE_STORE_ENTRIES = 5000;
const MAX_JSON_BODY_BYTES = 32 * 1024;
export const RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const RATE_LIMIT_MAX_REQUESTS = 30;
export const CAS_HTTP_TIMEOUT_MS = Number(process.env.CAS_HTTP_TIMEOUT_MS) || 10000;
export const AUTH_TRANSACTION_TTL_MS = Math.min(
  Math.max(Number(process.env.AUTH_TRANSACTION_TTL_MS) || 5 * 60 * 1000, 30 * 1000),
  10 * 60 * 1000,
);
export const OIDC_METADATA_CACHE_TTL_MS = Math.min(
  Math.max(Number(process.env.OIDC_METADATA_CACHE_TTL_MS) || 60 * 60 * 1000, 60 * 1000),
  24 * 60 * 60 * 1000,
);
// Shorter than the discovery TTL: a JWKS is the thing that rotates.
export const JWKS_CACHE_TTL_MS = 10 * 60 * 1000;
// A token carrying an unknown kid forces one early refetch, then no more until
// this cooldown passes; a stream of invented kids must not turn every
// verification into a JWKS request against CAS.
export const JWKS_REFETCH_COOLDOWN_MS = 60 * 1000;
export const MAX_GRANT_SCOPE_ENTRIES = 5000;

// The only signing algorithm this server produces or accepts. CAS advertises
// exactly RS256 and publishes one RSA key, so there is nothing to negotiate.
export const JWT_ALGORITHM = 'RS256';
export const ID_TOKEN_CLOCK_TOLERANCE_SECONDS = 30;
export const REQUEST_JWT_LIFETIME_SECONDS = 5 * 60;

// Logging helpers

export const maskState = (state) => {
  if (!state) return 'null';
  const value = String(state);
  if (value.length <= 8) return `${value.slice(0, 1)}...(len:${value.length})`;
  return `${value.slice(0, 4)}...${value.slice(-4)}(len:${value.length})`;
};

const sanitizeErrorForLog = (err) => {
  const upstream = err instanceof UpstreamError ? err : undefined;
  const responseData = upstream?.data;
  const responseError = typeof responseData?.error === 'string' ? responseData.error : undefined;
  const responseErrorDescription =
    typeof responseData?.error_description === 'string' ? responseData.error_description : undefined;

  return {
    name: err?.name,
    message: err?.message,
    code: err?.code ?? err?.cause?.code,
    status: upstream?.upstreamStatus,
    endpoint: upstream?.endpoint,
    method: upstream?.method,
    responseError,
    responseErrorDescription,
  };
};

export const logSafeError = (message, err) => {
  console.error(message, sanitizeErrorForLog(err));
};

// Response helpers

// JSON only, no cookies, no HTML: only the transport and content-sniffing
// headers apply. CSP, frameguard, COOP and CORP govern documents, and there is
// no document here.
export const SECURITY_HEADERS = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  // Only takes effect behind a TLS terminator; browsers ignore HSTS served
  // over plain http, which is what the default 127.0.0.1 bind serves.
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
});

export const sendJson = (res, status, payload) => {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
  });
  res.end(body);
};

// Client-facing error helpers

// Every failure uses the OAuth error shape from RFC 6749 section 5.2. The log
// gets the detail; the client gets a code and a fixed description, never an
// upstream CAS body or a Node error string, which would turn this BFF into an
// outside probe for CAS.
const OAUTH_ERROR_DESCRIPTION = Object.freeze({
  invalid_request: 'The request was rejected by the authorization server.',
  invalid_grant: 'The supplied grant is invalid, expired, revoked, or already used.',
  invalid_scope: 'The requested scope is invalid or not permitted for this client.',
  temporarily_unavailable: 'The authorization server is rate limiting this client. Retry later.',
  server_error: 'The request could not be completed with the authorization server.',
});

export const sendOAuthError = (res, status, error, description = OAUTH_ERROR_DESCRIPTION[error]) =>
  sendJson(res, status, { error, error_description: description });

// Upstream status is mapped, not mirrored: 400 is the one case the caller
// caused; 401/403 mean CAS rejected THIS server's credentials, so 502; 429 is
// forwarded so the caller backs off; everything else, including no upstream
// response at all (timeout, DNS, a failed ID token check), is 502.
export const sendUpstreamError = (res, err, callerError) => {
  const upstreamStatus = err instanceof UpstreamError ? err.upstreamStatus : undefined;
  if (upstreamStatus === 400) return sendOAuthError(res, 400, callerError);
  if (upstreamStatus === 429) return sendOAuthError(res, 429, 'temporarily_unavailable');
  return sendOAuthError(res, 502, 'server_error');
};

// A request with no body, or one not read as JSON, leaves req.body undefined.
// Routes check this first so they answer 400 instead of throwing a raw V8 message.
export const hasJsonObjectBody = (req) =>
  Boolean(req.body) && typeof req.body === 'object' && !Array.isArray(req.body);

export const rejectMissingBody = (res) =>
  sendOAuthError(res, 400, 'invalid_request', 'A JSON object request body is required');

// Fail closed: an empty allowlist rejects every redirect URI. This is the only
// BFF-side control over a caller-supplied redirect URI; without it a caller
// could get its own URI signed with this server's key and receive the code itself.
export const isAllowedRedirectUri = (redirectUri) => {
  if (REDIRECT_HOST_ALLOWLIST.length === 0) return false;
  try {
    const parsed = new URL(String(redirectUri));
    return REDIRECT_HOST_ALLOWLIST.includes((parsed.host || '').toLowerCase());
  } catch {
    return false;
  }
};

// Request body reading

// Malformed or oversized bodies are a failure the caller can fix, so they keep
// a 4xx instead of being flattened into a 500.
export class BadRequestError extends Error {
  constructor(status, description) {
    super(description);
    this.name = 'BadRequestError';
    this.status = status;
    this.description = description;
  }
}

// Reads at most 32 kB and parses it as JSON. A missing body, or one not
// declared application/json, resolves to undefined for the route guard above.
export const readJsonBody = (req) => new Promise((resolve, reject) => {
  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const chunks = [];
  let size = 0;

  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_JSON_BODY_BYTES) {
      // Stop buffering but keep draining, so the client can finish its upload
      // and read the 413.
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
