import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

const keyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKey = keyPair.privateKey.export({ type: 'pkcs1', format: 'pem' });
const publicKeyPem = keyPair.publicKey.export({ type: 'spki', format: 'pem' });
const publicJwk = keyPair.publicKey.export({ format: 'jwk' });

process.env.CLIENT_ID = 'sample-client';
process.env.CLIENT_SECRET = 'sample-secret';
process.env.RSA_PRIVATE_KEY = privateKey;
process.env.ALLOWED_REDIRECT_HOSTS = 'client.example.test';
// These tests exercise /oauth/token/refresh and /oauth/token/revoke directly,
// so the opt-in flag that gates them off by default must be on here.
process.env.DEMO_UNAUTHENTICATED_TOKEN_ROUTES = 'true';

const { createApp } = await import('../server.js');

const redirectUri = 'https://client.example.test/oauth/krdpass/callback';
const verifier = 'a'.repeat(43);
const codeChallenge = crypto.createHash('sha256').update(verifier, 'ascii').digest('base64url');
const state = 'state-transaction-123456789';
const nonce = 'nonce-transaction-123456789';

const base64UrlJson = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

// Local JWT minting so the tests can produce tokens the server must refuse and
// no test dependency is needed to build them: alg none, an HS256 forgery keyed
// with the RSA public key, a wrong kid, and a valid token with a broken
// signature. The production verifier never sees this code.
const signTestJwt = ({ claims, alg = 'RS256', kid = 'test-key', hmacSecret, tamperSignature = false }) => {
  const signingInput = `${base64UrlJson({ alg, typ: 'JWT', kid })}.${base64UrlJson(claims)}`;
  if (alg === 'none') return `${signingInput}.`;
  const signature = alg === 'HS256'
    ? crypto.createHmac('sha256', hmacSecret).update(signingInput).digest()
    : crypto.sign('sha256', Buffer.from(signingInput), privateKey);
  if (tamperSignature) signature[0] ^= 0xff;
  return `${signingInput}.${signature.toString('base64url')}`;
};

const startTestServer = async ({
  idTokenNonce = nonce,
  idTokenIssuer = 'https://account.id.krd',
  idTokenAudience = 'sample-client',
  idTokenAzp,
  includeExpiry = true,
  idTokenLifetimeSeconds = 300,
  idTokenNotBefore,
  idTokenAlg = 'RS256',
  idTokenKid = 'test-key',
  idTokenHmacSecret,
  tamperIdTokenSignature = false,
  discoveryJwksUri = 'https://account.id.krd/keys',
  holdPar = false,
  postFailure,
} = {}) => {
  const calls = [];
  let resolveParStarted;
  let releasePar;
  const parStarted = new Promise((resolve) => { resolveParStarted = resolve; });
  const parRelease = new Promise((resolve) => { releasePar = resolve; });
  const mockCas = {
    async post(url, body) {
      calls.push({ method: 'post', url, body });
      if (postFailure) throw postFailure();
      if (url.endsWith('/connect/par')) {
        resolveParStarted();
        if (holdPar) await parRelease;
        return { data: { request_uri: 'urn:ietf:params:oauth:request_uri:sample', expires_in: 300 } };
      }
      if (url.endsWith('/connect/token')) {
        const issuedAt = Math.floor(Date.now() / 1000);
        return {
          data: {
            access_token: 'access-token',
            token_type: 'Bearer',
            expires_in: 300,
            id_token: signTestJwt({
              alg: idTokenAlg,
              kid: idTokenKid,
              hmacSecret: idTokenHmacSecret,
              tamperSignature: tamperIdTokenSignature,
              claims: {
                iss: idTokenIssuer,
                aud: idTokenAudience,
                nonce: idTokenNonce,
                sub: 'citizen-1',
                iat: issuedAt,
                ...(idTokenAzp ? { azp: idTokenAzp } : {}),
                ...(includeExpiry ? { exp: issuedAt + idTokenLifetimeSeconds } : {}),
                ...(idTokenNotBefore !== undefined ? { nbf: issuedAt + idTokenNotBefore } : {}),
              },
            }),
          },
        };
      }
      throw new Error(`Unexpected CAS POST ${url}`);
    },
    async get(url) {
      calls.push({ method: 'get', url });
      if (url.endsWith('/.well-known/openid-configuration')) {
        return { data: { issuer: 'https://account.id.krd', jwks_uri: discoveryJwksUri } };
      }
      if (url === 'https://account.id.krd/keys') {
        return { data: { keys: [{ ...publicJwk, kid: 'test-key', use: 'sig' }] } };
      }
      throw new Error(`Unexpected CAS GET ${url}`);
    },
  };

  const app = createApp({ httpClient: mockCas });
  const server = await new Promise((resolve) => {
    const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
  });
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    calls,
    parStarted,
    releasePar,
    close: () => new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve())),
  };
};

const postJson = async (baseUrl, path, body) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json(), headers: response.headers };
};

const createTransaction = (baseUrl) => postJson(baseUrl, '/oauth/par', {
  codeChallenge,
  codeChallengeMethod: 'S256',
  state,
  nonce,
  environment: 'production',
  redirectUri,
  scope: 'openid profile',
});

const exchangeToken = (baseUrl, { code = 'authorization-code', codeVerifier = verifier, transactionState = state } = {}) =>
  postJson(baseUrl, '/oauth/token', { code, codeVerifier, state: transactionState });

// POST with no body at all. Nothing is parsed, so req.body stays undefined,
// which is what used to make three of the four routes throw a raw V8 message.
const postWithoutBody = async (baseUrl, path) => {
  const response = await fetch(`${baseUrl}${path}`, { method: 'POST' });
  return { status: response.status, body: await response.json() };
};

// A CAS failure or an internal throw must reach the caller as an OAuth code and
// nothing else: no upstream body, no Node or V8 error text.
const assertSanitizedUpstreamFailure = (response) => {
  assert.equal(response.status, 502);
  assert.deepEqual(Object.keys(response.body).sort(), ['error', 'error_description']);
  assert.equal(response.body.error, 'server_error');
  assert.doesNotMatch(response.body.error_description, /jwt|nonce|azp|token|discovery|Cannot |undefined/i);
};

// Runs a full PAR + token exchange against a fixture and returns the exchange.
const exchangeWith = async (fixtureOptions, assertion) => {
  const fixture = await startTestServer(fixtureOptions);
  try {
    await createTransaction(fixture.baseUrl);
    await assertion(await exchangeToken(fixture.baseUrl), fixture);
  } finally {
    await fixture.close();
  }
};

test('uses only stored transaction values and atomically consumes state', async () => {
  const fixture = await startTestServer();
  try {
    const par = await createTransaction(fixture.baseUrl);
    assert.equal(par.status, 200);
    assert.deepEqual(Object.keys(par.body).sort(), ['expiresIn', 'requestUri', 'state']);

    const exchange = await exchangeToken(fixture.baseUrl);
    assert.equal(exchange.status, 200);
    const tokenRequest = fixture.calls.find((call) => call.url.endsWith('/connect/token'));
    assert.equal(tokenRequest.body.get('redirect_uri'), redirectUri);

    const replay = await exchangeToken(fixture.baseUrl);
    assert.equal(replay.status, 400);
    assert.equal(replay.body.error, 'Invalid or expired state parameter');
    assert.equal(fixture.calls.filter((call) => call.url.endsWith('/connect/token')).length, 1);
  } finally {
    await fixture.close();
  }
});

test('signs the PAR request object as an RS256 JAR the registered public key verifies', async () => {
  const fixture = await startTestServer();
  try {
    await createTransaction(fixture.baseUrl);
    const parCall = fixture.calls.find((call) => call.url.endsWith('/connect/par'));
    const [headerSegment, payloadSegment, signatureSegment] = parCall.body.get('request').split('.');

    const header = JSON.parse(Buffer.from(headerSegment, 'base64url').toString('utf8'));
    assert.deepEqual(header, { alg: 'RS256', typ: 'JWT' });

    // Verified with webcrypto, which is a different implementation from the
    // crypto.sign the server signs with, so this does not just check that the
    // signer agrees with itself.
    const verifyKey = await crypto.subtle.importKey(
      'jwk',
      { ...publicJwk, alg: 'RS256', ext: true, key_ops: ['verify'] },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const signatureIsValid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      verifyKey,
      Buffer.from(signatureSegment, 'base64url'),
      Buffer.from(`${headerSegment}.${payloadSegment}`),
    );
    assert.equal(signatureIsValid, true);

    const claims = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8'));
    assert.equal(claims.iss, 'sample-client');
    assert.equal(claims.aud, 'https://account.id.krd');
    assert.equal(claims.redirect_uri, redirectUri);
    assert.equal(claims.code_challenge, codeChallenge);
    assert.equal(claims.code_challenge_method, 'S256');
    assert.equal(claims.response_type, 'code');
    assert.equal(typeof claims.jti, 'string');
    assert.equal(claims.exp - claims.iat, 300);
  } finally {
    await fixture.close();
  }
});

test('rejects a concurrent duplicate PAR reservation before the first PAR completes', async () => {
  const fixture = await startTestServer({ holdPar: true });
  try {
    const firstPar = createTransaction(fixture.baseUrl);
    await fixture.parStarted;

    const duplicate = await createTransaction(fixture.baseUrl);
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error, 'An authorization transaction already exists for this state');

    fixture.releasePar();
    assert.equal((await firstPar).status, 200);
  } finally {
    await fixture.close();
  }
});

test('rejects a mismatched PKCE verifier before calling CAS', async () => {
  const fixture = await startTestServer();
  try {
    await createTransaction(fixture.baseUrl);
    const response = await exchangeToken(fixture.baseUrl, { codeVerifier: 'b'.repeat(43) });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'Invalid PKCE code verifier');
    assert.equal(fixture.calls.filter((call) => call.url.endsWith('/connect/token')).length, 0);
  } finally {
    await fixture.close();
  }
});

test('rejects fields outside the BFF token request contract without consuming state', async () => {
  const fixture = await startTestServer();
  try {
    await createTransaction(fixture.baseUrl);
    const response = await postJson(fixture.baseUrl, '/oauth/token', {
      code: 'authorization-code',
      codeVerifier: verifier,
      state,
      environment: 'production',
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'Only code, codeVerifier, and state are allowed');
    assert.equal((await exchangeToken(fixture.baseUrl)).status, 200);
  } finally {
    await fixture.close();
  }
});

test('verifies ID token issuer, audience, signature, expiry, and stored nonce before success', async () => {
  await exchangeWith({ idTokenNonce: 'wrong-nonce' }, assertSanitizedUpstreamFailure);
});

test('rejects an ID token whose issuer differs from trusted discovery metadata', async () => {
  await exchangeWith({ idTokenIssuer: 'https://unexpected-issuer.example.test' }, assertSanitizedUpstreamFailure);
});

test('rejects an ID token whose audience is not this client', async () => {
  await exchangeWith({ idTokenAudience: 'another-client' }, assertSanitizedUpstreamFailure);
});

test('rejects a multi-audience ID token with a mismatched azp claim', async () => {
  await exchangeWith({
    idTokenAudience: ['sample-client', 'another-client'],
    idTokenAzp: 'another-client',
  }, assertSanitizedUpstreamFailure);
});

test('rejects a single-audience ID token with a mismatched azp claim', async () => {
  await exchangeWith({ idTokenAzp: 'another-client' }, assertSanitizedUpstreamFailure);
});

test('rejects an expired ID token', async () => {
  await exchangeWith({ idTokenLifetimeSeconds: -60 }, assertSanitizedUpstreamFailure);
});

test('rejects an ID token without the required expiry claim', async () => {
  await exchangeWith({ includeExpiry: false }, assertSanitizedUpstreamFailure);
});

test('rejects an ID token whose nbf is in the future', async () => {
  await exchangeWith({ idTokenNotBefore: 3600 }, assertSanitizedUpstreamFailure);
});

// The verifier hardcodes RS256 and reads the token's alg only to reject
// anything else, so these two cannot degrade into an unsigned or
// symmetric-key check no matter what the token asks for.
test('rejects an unsigned ID token that claims alg none', async () => {
  await exchangeWith({ idTokenAlg: 'none' }, async (response, fixture) => {
    assertSanitizedUpstreamFailure(response);
    // The alg check runs before any key lookup, so no JWKS fetch happens.
    assert.equal(fixture.calls.some((call) => call.url === 'https://account.id.krd/keys'), false);
  });
});

test('rejects an HS256 ID token forged with the RSA public key as the HMAC secret', async () => {
  await exchangeWith({ idTokenAlg: 'HS256', idTokenHmacSecret: publicKeyPem }, async (response, fixture) => {
    assertSanitizedUpstreamFailure(response);
    assert.equal(fixture.calls.some((call) => call.url === 'https://account.id.krd/keys'), false);
  });
});

test('rejects an ID token whose kid is not in the CAS JWKS', async () => {
  await exchangeWith({ idTokenKid: 'not-the-test-key' }, assertSanitizedUpstreamFailure);
});

test('rejects an ID token with a valid shape but a broken signature', async () => {
  await exchangeWith({ tamperIdTokenSignature: true }, assertSanitizedUpstreamFailure);
});

test('rejects OIDC discovery metadata that points JWKS outside the selected CAS origin', async () => {
  await exchangeWith({ discoveryJwksUri: 'https://untrusted.example.test/keys' }, (response, fixture) => {
    assertSanitizedUpstreamFailure(response);
    assert.equal(fixture.calls.some((call) => call.url === 'https://untrusted.example.test/keys'), false);
  });
});

test('returns a verified code-flow token result without changing the sample response shape', async () => {
  const fixture = await startTestServer();
  try {
    await createTransaction(fixture.baseUrl);
    const response = await exchangeToken(fixture.baseUrl);
    assert.equal(response.status, 200);
    assert.equal(response.body.accessToken, 'access-token');
    assert.equal(response.body.idToken !== undefined, true);
    const tokenRequest = fixture.calls.find((call) => call.url.endsWith('/connect/token'));
    assert.equal(tokenRequest.body.get('redirect_uri'), redirectUri);
    assert.equal(tokenRequest.body.get('code_verifier'), verifier);
  } finally {
    await fixture.close();
  }
});

test('answers a body-less POST on every OAuth route with a clean 400 and no internals', async () => {
  const fixture = await startTestServer();
  try {
    for (const path of ['/oauth/par', '/oauth/token', '/oauth/token/refresh', '/oauth/token/revoke']) {
      const response = await postWithoutBody(fixture.baseUrl, path);
      assert.equal(response.status, 400, path);
      assert.equal(response.body.error, 'invalid_request', path);
      assert.doesNotMatch(response.body.error_description, /destructure|undefined|req\.body/i, path);
    }
    assert.equal(fixture.calls.length, 0);
  } finally {
    await fixture.close();
  }
});

test('answers malformed JSON with a clean 400 rather than a stack page', async () => {
  const fixture = await startTestServer();
  try {
    const response = await fetch(`${fixture.baseUrl}/oauth/par`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'invalid_request');
  } finally {
    await fixture.close();
  }
});

test('rejects a request body over the 32kb limit without buffering it', async () => {
  const fixture = await startTestServer();
  try {
    const response = await fetch(`${fixture.baseUrl}/oauth/par`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ codeChallenge: 'x'.repeat(64 * 1024) }),
    });
    assert.equal(response.status, 413);
    assert.equal((await response.json()).error, 'invalid_request');
    assert.equal(fixture.calls.length, 0);
  } finally {
    await fixture.close();
  }
});

test('rejects a redirect URI whose host is not in the allowlist', async () => {
  const fixture = await startTestServer();
  try {
    const response = await postJson(fixture.baseUrl, '/oauth/par', {
      codeChallenge,
      codeChallengeMethod: 'S256',
      state,
      nonce,
      environment: 'production',
      redirectUri: 'https://attacker.example.test/callback',
      scope: 'openid profile',
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'redirectUri host is not in server allowlist');
    assert.equal(fixture.calls.length, 0);
  } finally {
    await fixture.close();
  }
});

test('sets no-store and the JSON API security headers on OAuth responses', async () => {
  const fixture = await startTestServer();
  try {
    const response = await postWithoutBody(fixture.baseUrl, '/oauth/par');
    assert.equal(response.status, 400);
    const headers = (await fetch(`${fixture.baseUrl}/oauth/par`, { method: 'POST' })).headers;
    assert.equal(headers.get('cache-control'), 'no-store');
    assert.equal(headers.get('pragma'), 'no-cache');
    assert.equal(headers.get('x-content-type-options'), 'nosniff');
    assert.equal(headers.get('referrer-policy'), 'no-referrer');
    assert.match(headers.get('strict-transport-security'), /max-age=31536000/);
    assert.equal(headers.get('x-powered-by'), null);
  } finally {
    await fixture.close();
  }
});

test('answers an unknown path with JSON 404 and a wrong method with JSON 405', async () => {
  const fixture = await startTestServer();
  try {
    const notFound = await fetch(`${fixture.baseUrl}/nope`);
    assert.equal(notFound.status, 404);
    assert.equal((await notFound.json()).error, 'not_found');

    const wrongMethod = await fetch(`${fixture.baseUrl}/oauth/par`);
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get('allow'), 'POST');
    assert.equal((await wrongMethod.json()).error, 'method_not_allowed');
  } finally {
    await fixture.close();
  }
});

test('leaves /oauth/token/refresh and /oauth/token/revoke unregistered unless DEMO_UNAUTHENTICATED_TOKEN_ROUTES=true', async () => {
  const previous = process.env.DEMO_UNAUTHENTICATED_TOKEN_ROUTES;
  delete process.env.DEMO_UNAUTHENTICATED_TOKEN_ROUTES;
  try {
    const app = createApp({ httpClient: { get: async () => { throw new Error('unused'); }, post: async () => { throw new Error('unused'); } } });
    const server = await new Promise((resolve) => {
      const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
    });
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;
    try {
      const refresh = await fetch(`${baseUrl}/oauth/token/refresh`, { method: 'POST' });
      assert.equal(refresh.status, 404);
      assert.equal((await refresh.json()).error, 'not_found');

      const revoke = await fetch(`${baseUrl}/oauth/token/revoke`, { method: 'POST' });
      assert.equal(revoke.status, 404);
      assert.equal((await revoke.json()).error, 'not_found');
    } finally {
      await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    }
  } finally {
    if (previous === undefined) delete process.env.DEMO_UNAUTHENTICATED_TOKEN_ROUTES;
    else process.env.DEMO_UNAUTHENTICATED_TOKEN_ROUTES = previous;
  }
});

test('rate limits /oauth to 30 requests per minute per client', async () => {
  const fixture = await startTestServer();
  try {
    for (let i = 0; i < 30; i += 1) {
      assert.equal((await postWithoutBody(fixture.baseUrl, '/oauth/par')).status, 400, `request ${i + 1}`);
    }
    const limited = await postWithoutBody(fixture.baseUrl, '/oauth/par');
    assert.equal(limited.status, 429);
    assert.equal(limited.body.error, 'temporarily_unavailable');

    // /health is outside the limiter, the same way the express middleware was
    // mounted only under /oauth.
    assert.equal((await fetch(`${fixture.baseUrl}/health`)).status, 200);
  } finally {
    await fixture.close();
  }
});

test('maps upstream CAS status codes instead of mirroring them', async () => {
  const upstream = (status) => () => Object.assign(new Error('CAS failed'), { upstreamStatus: status });
  const cases = [
    // The caller owns a 400: bad code, dead grant.
    { status: 400, expectStatus: 400, expectError: 'invalid_grant' },
    // 401/403 mean CAS rejected this server's credentials, not the caller's input.
    { status: 401, expectStatus: 502, expectError: 'server_error' },
    { status: 403, expectStatus: 502, expectError: 'server_error' },
    { status: 429, expectStatus: 429, expectError: 'temporarily_unavailable' },
    { status: 500, expectStatus: 502, expectError: 'server_error' },
  ];

  for (const testCase of cases) {
    const fixture = await startTestServer();
    try {
      await createTransaction(fixture.baseUrl);
      const failing = await startTestServer({ postFailure: upstream(testCase.status) });
      try {
        const response = await postJson(failing.baseUrl, '/oauth/token/refresh', {
          refreshToken: 'refresh-token-value',
          environment: 'production',
        });
        assert.equal(response.status, testCase.expectStatus, `upstream ${testCase.status}`);
        assert.equal(response.body.error, testCase.expectError, `upstream ${testCase.status}`);
      } finally {
        await failing.close();
      }
    } finally {
      await fixture.close();
    }
  }
});

test('maps a CAS timeout or transport failure to 502, never to a caller 4xx', async () => {
  const fixture = await startTestServer({
    postFailure: () => new Error('CAS request failed: The operation was aborted due to timeout'),
  });
  try {
    const response = await postJson(fixture.baseUrl, '/oauth/token/revoke', {
      token: 'token-value-long-enough',
      environment: 'production',
    });
    assert.equal(response.status, 502);
    assert.equal(response.body.error, 'server_error');
  } finally {
    await fixture.close();
  }
});
