import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import jwt from 'jsonwebtoken';

const keyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKey = keyPair.privateKey.export({ type: 'pkcs1', format: 'pem' });
const publicJwk = keyPair.publicKey.export({ format: 'jwk' });

process.env.CLIENT_ID = 'sample-client';
process.env.CLIENT_SECRET = 'sample-secret';
process.env.RSA_PRIVATE_KEY = privateKey;
process.env.ALLOWED_REDIRECT_HOSTS = 'client.example.test';

const { createApp } = await import('../server.js');

const redirectUri = 'https://client.example.test/oauth/krdpass/callback';
const verifier = 'a'.repeat(43);
const codeChallenge = crypto.createHash('sha256').update(verifier, 'ascii').digest('base64url');
const state = 'state-transaction-123456789';
const nonce = 'nonce-transaction-123456789';

const startTestServer = async ({
  idTokenNonce = nonce,
  idTokenIssuer = 'https://account.id.krd',
  idTokenAudience = 'sample-client',
  idTokenAzp,
  includeExpiry = true,
  idTokenExpiresIn = '5m',
  discoveryJwksUri = 'https://account.id.krd/keys',
  holdPar = false,
} = {}) => {
  const calls = [];
  let resolveParStarted;
  let releasePar;
  const parStarted = new Promise((resolve) => { resolveParStarted = resolve; });
  const parRelease = new Promise((resolve) => { releasePar = resolve; });
  const mockCas = {
    async post(url, body) {
      calls.push({ method: 'post', url, body });
      if (url.endsWith('/connect/par')) {
        resolveParStarted();
        if (holdPar) await parRelease;
        return { data: { request_uri: 'urn:ietf:params:oauth:request_uri:sample', expires_in: 300 } };
      }
      if (url.endsWith('/connect/token')) {
        return {
          data: {
            access_token: 'access-token',
            token_type: 'Bearer',
            expires_in: 300,
            id_token: jwt.sign({
              iss: idTokenIssuer,
              aud: idTokenAudience,
              nonce: idTokenNonce,
              sub: 'citizen-1',
              ...(idTokenAzp ? { azp: idTokenAzp } : {}),
            }, privateKey, {
              algorithm: 'RS256',
              keyid: 'test-key',
              ...(includeExpiry ? { expiresIn: idTokenExpiresIn } : { noTimestamp: true }),
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
  return { status: response.status, body: await response.json() };
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
  const fixture = await startTestServer({ idTokenNonce: 'wrong-nonce' });
  try {
    await createTransaction(fixture.baseUrl);
    const response = await exchangeToken(fixture.baseUrl);
    assert.equal(response.status, 500);
    assert.equal(response.body.error, 'ID token nonce does not match the authorization transaction');
  } finally {
    await fixture.close();
  }
});

test('rejects an ID token whose issuer differs from trusted discovery metadata', async () => {
  const fixture = await startTestServer({ idTokenIssuer: 'https://unexpected-issuer.example.test' });
  try {
    await createTransaction(fixture.baseUrl);
    const response = await exchangeToken(fixture.baseUrl);
    assert.equal(response.status, 500);
    assert.match(response.body.error, /jwt issuer invalid/);
  } finally {
    await fixture.close();
  }
});

test('rejects a multi-audience ID token with a mismatched azp claim', async () => {
  const fixture = await startTestServer({
    idTokenAudience: ['sample-client', 'another-client'],
    idTokenAzp: 'another-client',
  });
  try {
    await createTransaction(fixture.baseUrl);
    const response = await exchangeToken(fixture.baseUrl);
    assert.equal(response.status, 500);
    assert.equal(response.body.error, 'ID token azp does not match this client');
  } finally {
    await fixture.close();
  }
});

test('rejects a single-audience ID token with a mismatched azp claim', async () => {
  const fixture = await startTestServer({ idTokenAzp: 'another-client' });
  try {
    await createTransaction(fixture.baseUrl);
    const response = await exchangeToken(fixture.baseUrl);
    assert.equal(response.status, 500);
    assert.equal(response.body.error, 'ID token azp does not match this client');
  } finally {
    await fixture.close();
  }
});

test('rejects an expired ID token', async () => {
  const fixture = await startTestServer({ idTokenExpiresIn: -60 });
  try {
    await createTransaction(fixture.baseUrl);
    const response = await exchangeToken(fixture.baseUrl);
    assert.equal(response.status, 500);
    assert.equal(response.body.error, 'jwt expired');
  } finally {
    await fixture.close();
  }
});

test('rejects an ID token without the required expiry claim', async () => {
  const fixture = await startTestServer({ includeExpiry: false });
  try {
    await createTransaction(fixture.baseUrl);
    const response = await exchangeToken(fixture.baseUrl);
    assert.equal(response.status, 500);
    assert.equal(response.body.error, 'ID token is missing an expiry claim');
  } finally {
    await fixture.close();
  }
});

test('rejects OIDC discovery metadata that points JWKS outside the selected CAS origin', async () => {
  const fixture = await startTestServer({ discoveryJwksUri: 'https://untrusted.example.test/keys' });
  try {
    await createTransaction(fixture.baseUrl);
    const response = await exchangeToken(fixture.baseUrl);
    assert.equal(response.status, 500);
    assert.equal(response.body.error, 'CAS OIDC discovery endpoints are not trusted for the selected environment');
    assert.equal(fixture.calls.some((call) => call.url === 'https://untrusted.example.test/keys'), false);
  } finally {
    await fixture.close();
  }
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
