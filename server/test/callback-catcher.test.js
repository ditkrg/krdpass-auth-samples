import assert from 'node:assert/strict';
import test from 'node:test';

const { createCallbackCatcher, CALLBACK_PATH, LAST_CALLBACK_PATH } =
  await import('../callback-catcher.js');

const state = 'state-transaction-123456789';

const startCatcher = async () => {
  const server = createCallbackCatcher();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve())),
  };
};

test('captures a redirect and hands the code out exactly once', async () => {
  const fixture = await startCatcher();
  try {
    const empty = await fetch(`${fixture.baseUrl}${LAST_CALLBACK_PATH}`);
    assert.deepEqual(await empty.json(), { pending: true });

    const page = await fetch(`${fixture.baseUrl}${CALLBACK_PATH}?code=auth-code-123&state=${state}`);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.match(await page.text(), /auth-code-123/);

    const captured = await (await fetch(`${fixture.baseUrl}${LAST_CALLBACK_PATH}`)).json();
    assert.equal(captured.pending, false);
    assert.equal(captured.code, 'auth-code-123');
    assert.equal(captured.state, state);

    assert.deepEqual(await (await fetch(`${fixture.baseUrl}${LAST_CALLBACK_PATH}`)).json(), { pending: true });
  } finally {
    await fixture.close();
  }
});

test('escapes redirect parameters before rendering them', async () => {
  const fixture = await startCatcher();
  try {
    const injected = encodeURIComponent('<script>alert(1)</script>');
    const html = await (await fetch(`${fixture.baseUrl}${CALLBACK_PATH}?code=abc&state=${injected}`)).text();
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.match(html, /&lt;script&gt;/);
  } finally {
    await fixture.close();
  }
});

test('reports an OAuth error redirect instead of a code', async () => {
  const fixture = await startCatcher();
  try {
    const page = await fetch(`${fixture.baseUrl}${CALLBACK_PATH}?error=access_denied&error_description=User%20cancelled`);
    assert.match(await page.text(), /access_denied/);

    const captured = await (await fetch(`${fixture.baseUrl}${LAST_CALLBACK_PATH}`)).json();
    assert.equal(captured.error, 'access_denied');
    assert.equal(captured.errorDescription, 'User cancelled');
    assert.equal(captured.code, undefined);
  } finally {
    await fixture.close();
  }
});

test('keeps a pending capture when a bare request hits the callback path', async () => {
  const fixture = await startCatcher();
  try {
    await fetch(`${fixture.baseUrl}${CALLBACK_PATH}?code=keep-me&state=${state}`);

    await fetch(`${fixture.baseUrl}${CALLBACK_PATH}`);
    await fetch(`${fixture.baseUrl}${CALLBACK_PATH}`, { method: 'HEAD' });
    await fetch(`${fixture.baseUrl}${CALLBACK_PATH}?code=${'x'.repeat(5000)}`);

    const captured = await (await fetch(`${fixture.baseUrl}${LAST_CALLBACK_PATH}`)).json();
    assert.equal(captured.code, 'keep-me');
  } finally {
    await fixture.close();
  }
});

test('keeps the captured code out of caches and rejects other methods', async () => {
  const fixture = await startCatcher();
  try {
    const pending = await fetch(`${fixture.baseUrl}${LAST_CALLBACK_PATH}`);
    assert.equal(pending.headers.get('cache-control'), 'no-store');

    const posted = await fetch(`${fixture.baseUrl}${CALLBACK_PATH}`, { method: 'POST' });
    assert.equal(posted.status, 405);

    const unknown = await fetch(`${fixture.baseUrl}/nope`);
    assert.equal(unknown.status, 404);
  } finally {
    await fixture.close();
  }
});

test('rate limits the route that hands out the code', async () => {
  const fixture = await startCatcher();
  try {
    let limited = 0;
    for (let i = 0; i < 31; i += 1) {
      if ((await fetch(`${fixture.baseUrl}${LAST_CALLBACK_PATH}`)).status === 429) limited += 1;
    }
    assert.ok(limited > 0, 'expected the fetch route to be rate limited');
  } finally {
    await fixture.close();
  }
});
