/**
 * Demo-only capture of the authorization code KRDPASS delivers to the
 * registered redirect URI, run as its own process on its own port.
 *
 * The SDKs take that redirect inside the app. A run driven from a REST client
 * has no app, so this parks the last redirect in memory and hands it over once.
 * It is deliberately not part of the reference server: nothing an integrator
 * copies from `server.js` should carry an unauthenticated route that hands out
 * an authorization code.
 *
 *   npm run catcher
 */

import http from 'node:http';

import { AUTH_TRANSACTION_TTL_MS, MAX_CODE_LENGTH, MAX_STATE_LENGTH, sendJson } from './support.js';

export const CALLBACK_PATH = process.env.CATCHER_PATH || '/_krdpass/oauth/callback';
export const LAST_CALLBACK_PATH = '/_krdpass/demo/last-callback';

const HOST = process.env.CATCHER_HOST || '127.0.0.1';
const PORT = Number(process.env.CATCHER_PORT) || 3001;
const MAX_PARAM_LENGTH = 512;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 30;

const HTML_ENTITIES = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
});

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);

const readParam = (params, name, maxLength) => {
  const value = params.get(name);
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) return undefined;
  return value;
};

const renderPage = (redirect) => {
  const rows = redirect.error
    ? [['error', redirect.error], ['error_description', redirect.errorDescription]]
    : [['code', redirect.code], ['state', redirect.state]];

  const body = rows
    .filter(([, value]) => value)
    .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KRDPASS demo callback</title>
<style>
body { font: 16px/1.5 system-ui, sans-serif; margin: 0; padding: 24px; }
h1 { font-size: 18px; }
dt { font-weight: 600; margin-top: 16px; }
dd { margin: 4px 0 0; font-family: ui-monospace, monospace; word-break: break-all; }
p { color: #555; }
</style>
</head>
<body>
<h1>${redirect.error ? 'Authorization failed' : 'Authorization code received'}</h1>
<dl>${body || '<dd>No recognised parameters on this redirect.</dd>'}</dl>
<p>Fetch it from the collection, or copy it by hand. It is handed out once.</p>
</body>
</html>`;
};

export const createCallbackCatcher = () => {
  let captured;
  const hits = new Map();

  const isRateLimited = (client) => {
    const windowStart = Date.now() - RATE_LIMIT_WINDOW_MS;
    const live = (hits.get(client) || []).filter((at) => at > windowStart);
    live.push(Date.now());
    hits.set(client, live);
    return live.length > RATE_LIMIT_MAX_REQUESTS;
  };

  const handleCallback = (req, res) => {
    const params = new URL(req.url, 'http://localhost').searchParams;
    const redirect = {
      code: readParam(params, 'code', MAX_CODE_LENGTH),
      state: readParam(params, 'state', MAX_STATE_LENGTH),
      iss: readParam(params, 'iss', MAX_PARAM_LENGTH),
      error: readParam(params, 'error', MAX_PARAM_LENGTH),
      errorDescription: readParam(params, 'error_description', MAX_PARAM_LENGTH),
      receivedAt: Date.now(),
    };

    // HEAD reaches this handler and the path is published, so a probe, a link
    // preview or a reload must not evict a code nobody has collected yet.
    const stored = Boolean(redirect.code || redirect.error);
    if (stored) captured = redirect;

    console.log('[CALLBACK] request', { hasCode: Boolean(redirect.code), error: redirect.error, stored });

    const page = Buffer.from(renderPage(redirect));
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': page.length,
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    });
    res.end(page);
  };

  // Handing a capture over once keeps a stale code from an abandoned attempt
  // from being exchanged by accident: a second read reports pending.
  const handleLastCallback = (req, res) => {
    res.setHeader('Cache-Control', 'no-store');

    if (!captured || Date.now() - captured.receivedAt >= AUTH_TRANSACTION_TTL_MS) {
      captured = undefined;
      return sendJson(res, 200, { pending: true });
    }

    const payload = { pending: false, ...captured };
    captured = undefined;
    return sendJson(res, 200, payload);
  };

  return http.createServer((req, res) => {
    const path = (req.url || '/').split('?')[0];
    const handler = { [CALLBACK_PATH]: handleCallback, [LAST_CALLBACK_PATH]: handleLastCallback }[path];

    if (!handler) return sendJson(res, 404, { error: 'not_found' });
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET');
      return sendJson(res, 405, { error: 'method_not_allowed' });
    }
    if (isRateLimited(req.socket.remoteAddress || 'unknown')) {
      res.setHeader('Retry-After', String(RATE_LIMIT_WINDOW_MS / 1000));
      return sendJson(res, 429, { error: 'temporarily_unavailable' });
    }
    return handler(req, res);
  });
};

const isDirectExecution = process.argv[1] && import.meta.filename === process.argv[1];
if (isDirectExecution) {
  createCallbackCatcher().listen(PORT, HOST, () => {
    console.log(`KRDPASS demo callback catcher: http://${HOST}:${PORT}${CALLBACK_PATH}`);
    console.log('[WARN] This route has no authentication. It hands out the last authorization code it captured.');
  });
}
