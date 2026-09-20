import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// The collection hardcodes the server's own rejection messages. Replaying it
// here means changing one of those strings breaks CI instead of silently
// leaving an imported collection asserting text the server no longer sends.
process.env.CLIENT_ID = 'collection-client';
process.env.CLIENT_SECRET = 'collection-secret';
process.env.RSA_PRIVATE_KEY = (await import('node:crypto'))
  .generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ type: 'pkcs1', format: 'pem' });
process.env.ALLOWED_REDIRECT_HOSTS = 'your-backend.example.com';

const { createApp } = await import('../server.js');

const collection = JSON.parse(
  fs.readFileSync(new URL('../../postman/krdpass-auth.postman_collection.json', import.meta.url)),
);
const environment = JSON.parse(
  fs.readFileSync(new URL('../../postman/krdpass-local.postman_environment.json', import.meta.url)),
);
const vars = Object.fromEntries(environment.values.map((v) => [v.key, v.value]));
const resolve = (text) => text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);

const checks = collection.item.find((folder) => folder.name === 'Validation checks').item;

test('the collection asserts messages this server actually sends', async (t) => {
  assert.ok(checks.length > 0, 'expected validation checks in the collection');

  const app = createApp({
    httpClient: { get: async () => { throw new Error('unused'); }, post: async () => { throw new Error('unused'); } },
  });
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const { port } = server.address();

  try {
    for (const item of checks) {
      const script = item.event.find((e) => e.listen === 'test').script.exec.join('\n');
      const status = Number(/to.have.status\((\d+)\)/.exec(script)[1]);
      const error = /error\).to.eql\('([^']+)'\)/.exec(script)[1];
      const fragment = /to.include\('([^']+)'\)/.exec(script)[1];

      await t.test(item.name, async () => {
        const response = await fetch(`http://127.0.0.1:${port}${new URL(resolve(item.request.url.raw)).pathname}`, {
          method: item.request.method,
          headers: { 'content-type': 'application/json' },
          body: resolve(item.request.body.raw),
        });
        const body = await response.json();
        assert.equal(response.status, status);
        assert.equal(body.error, error);
        assert.ok(
          body.error_description.includes(fragment),
          `collection expects "${fragment}", server sent "${body.error_description}"`,
        );
      });
    }
  } finally {
    await new Promise((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
  }
});
