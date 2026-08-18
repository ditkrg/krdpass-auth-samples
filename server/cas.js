/**
 * Everything this server does against CAS: the fetch-based HTTP client, the
 * RS256 JWT primitives, the OAuth calls (PAR, code exchange, refresh, revoke,
 * OIDC discovery), and ID token verification. server.js never builds a CAS
 * request itself.
 */

import crypto from 'node:crypto';

import {
  CAS_HTTP_TIMEOUT_MS,
  CLIENT_ID,
  CLIENT_SECRET,
  ID_TOKEN_CLOCK_TOLERANCE_SECONDS,
  JWKS_CACHE_TTL_MS,
  JWKS_REFETCH_COOLDOWN_MS,
  JWT_ALGORITHM,
  OIDC_METADATA_CACHE_TTL_MS,
  REQUEST_JWT_LIFETIME_SECONDS,
  RSA_PRIVATE_KEY,
  SCOPE,
  maskState,
} from './support.js';

// fetch resolves for a 4xx or 5xx, so a CAS rejection must throw explicitly.
// The property is upstreamStatus, not status, so a local error that happens to
// carry a status can never be mistaken for a CAS response.
export class UpstreamError extends Error {
  constructor(message, { upstreamStatus, data, endpoint, method } = {}) {
    super(message);
    this.name = 'UpstreamError';
    this.upstreamStatus = upstreamStatus;
    this.data = data;
    this.endpoint = endpoint;
    this.method = method;
  }
}

// A hard timeout on every CAS call so a slow upstream cannot hang the server.
// AbortSignal.timeout covers the whole exchange, not just connect.
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
    // sendUpstreamError maps it to 502, never a caller-owned 4xx.
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

export const casHttp = {
  get: (url) => casRequest('GET', url),
  post: (url, body) => casRequest('POST', url, body),
};

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
export async function pushAuthorizationRequest({ state, nonce, code_challenge, code_challenge_method, authServerUrl, redirectUri, scope }, httpClient = casHttp) {
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

export async function exchangeCodeForTokens({ code, code_verifier, authServerUrl, redirectUri }, httpClient = casHttp) {
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

  return data;
}

export async function refreshTokens({ refreshToken, scope, authServerUrl }, httpClient = casHttp) {
  const { data } = await httpClient.post(
    `${authServerUrl}/connect/token`,
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      // `undefined` means the caller sent no scope, so the parameter is omitted per RFC
      // 6749. An empty string is a real value here: it is what a request narrowed to
      // nothing produces, and CAS has to see it to reject it.
      ...(scope !== undefined ? { scope } : {}),
    })
  );

  return data;
}

export async function revokeToken({ token, tokenTypeHint, authServerUrl }, httpClient = casHttp) {
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
}

export const deriveS256Challenge = (codeVerifier) =>
  crypto.createHash('sha256').update(codeVerifier, 'ascii').digest('base64url');

const getOidcMetadata = async (authServerUrl, httpClient, metadataCache) => {
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
// used, and a key that is not an RS256-capable RSA signing key never enters the
// map, so it cannot be selected at all.
const importJwksKeys = async (jwksUri, httpClient) => {
  const { data } = await httpClient.get(jwksUri);
  const keys = new Map();
  for (const jwk of data?.keys || []) {
    if (typeof jwk.kid !== 'string') continue;
    if (jwk.kty !== 'RSA' || jwk.use === 'enc' || (jwk.alg && jwk.alg !== JWT_ALGORITHM)) continue;
    try {
      const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
      if (publicKey.asymmetricKeyType === 'rsa') keys.set(jwk.kid, publicKey);
    } catch {
      // A key this runtime cannot import is simply not offered. Skipping it
      // keeps one malformed entry from taking the whole JWKS down with it.
    }
  }
  return keys;
};

// One JWKS fetch per TTL rather than one per token exchange, and the imported
// KeyObject is cached so the same JWK is not re-parsed on every sign-in.
const getSigningKey = async (jwksUri, keyId, httpClient, keyCache) => {
  if (!keyId) throw new Error('ID token is missing a key id');

  const refresh = async () => {
    const entry = {
      keys: await importJwksKeys(jwksUri, httpClient),
      fetchedAt: Date.now(),
    };
    keyCache?.set(jwksUri, entry);
    return entry;
  };

  let entry = keyCache?.get(jwksUri);
  if (!entry || Date.now() - entry.fetchedAt >= JWKS_CACHE_TTL_MS) {
    entry = await refresh();
  } else if (!entry.keys.has(keyId) && Date.now() - entry.fetchedAt >= JWKS_REFETCH_COOLDOWN_MS) {
    // An unknown kid against a fresh cache is what an early key rotation looks
    // like; the cooldown keeps this to one refetch rather than one per kid.
    entry = await refresh();
  }

  const signingKey = entry.keys.get(keyId);
  if (!signingKey) throw new Error('No matching signing key was found in CAS JWKS');
  return signingKey;
};

/**
 * Verify an ID token before returning a successful result. Discovery and JWKS
 * are derived only from the selected server-side environment. `nonce` is
 * optional because a refresh response has no transaction to bind one to; every
 * other check still applies. `caches` is required, not defaulted: forgetting it
 * would silently cost a discovery and JWKS fetch per verification.
 */
export async function verifyIdToken({ idToken, nonce, authServerUrl }, httpClient = casHttp, caches) {
  if (!caches) {
    throw new Error('verifyIdToken requires a caches object ({ metadata, signingKeys })');
  }
  if (typeof idToken !== 'string' || idToken.length === 0) {
    throw new Error('CAS token response is missing id_token');
  }

  const { header, payloadSegment, signatureSegment, signingInput } = parseCompactJws(idToken);

  // The token's alg is read only to reject anything that is not RS256, never to
  // select how the signature gets checked: "alg": "none" and an HS256 token
  // forged with the public key both die here, before any key is fetched.
  if (header.alg !== JWT_ALGORITHM) {
    throw new Error('ID token uses an unsupported signing algorithm');
  }
  if (signatureSegment.length === 0) {
    throw new Error('ID token has no signature');
  }

  const metadata = await getOidcMetadata(authServerUrl, httpClient, caches.metadata);
  const signingKey = await getSigningKey(metadata.jwksUri, header.kid, httpClient, caches.signingKeys);
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
  if (nonce !== undefined && claims.nonce !== nonce) {
    throw new Error('ID token nonce does not match the authorization transaction');
  }
  return claims;
}
