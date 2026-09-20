/**
 * Demo-only capture of the authorization code KRDPASS delivers to the
 * registered redirect URI. The SDKs take that redirect inside the app; a run
 * driven from a REST client has no app, so this parks the last one in memory
 * and hands it to the caller once. server.js owns the routing.
 */

import { AUTH_TRANSACTION_TTL_MS, MAX_CODE_LENGTH, MAX_STATE_LENGTH, sendJson } from './support.js';

// Matches the path in the registered redirect URI. Override only if yours
// differs; the AASA document in extras.js publishes this same default.
export const CALLBACK_PATH = process.env.DEMO_CALLBACK_PATH || '/_krdpass/oauth/callback';
export const LAST_CALLBACK_PATH = '/_krdpass/demo/last-callback';

const MAX_ERROR_LENGTH = 512;

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

const renderPage = (captured) => {
  const rows = captured.error
    ? [
        ['error', captured.error],
        ['error_description', captured.errorDescription],
      ]
    : [
        ['code', captured.code],
        ['state', captured.state],
      ];

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
<h1>${captured.error ? 'Authorization failed' : 'Authorization code received'}</h1>
<dl>${body || '<dd>No recognised parameters on this redirect.</dd>'}</dl>
<p>Fetch it from the collection, or copy it by hand. It is handed out once.</p>
</body>
</html>`;
};

export const createCallbackCatcher = () => {
  let captured;

  const isExpired = () => !captured || Date.now() - captured.receivedAt >= AUTH_TRANSACTION_TTL_MS;

  const handleCallback = (req, res) => {
    const params = new URL(req.url, 'http://localhost').searchParams;

    captured = {
      code: readParam(params, 'code', MAX_CODE_LENGTH),
      state: readParam(params, 'state', MAX_STATE_LENGTH),
      iss: readParam(params, 'iss', MAX_ERROR_LENGTH),
      error: readParam(params, 'error', MAX_ERROR_LENGTH),
      errorDescription: readParam(params, 'error_description', MAX_ERROR_LENGTH),
      receivedAt: Date.now(),
    };

    console.log('[CALLBACK] captured', {
      hasCode: Boolean(captured.code),
      error: captured.error,
    });

    const page = Buffer.from(renderPage(captured));
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': page.length,
      'Cache-Control': 'no-store',
      // SECURITY_HEADERS carries no CSP because every other response is JSON.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    });
    res.end(page);
  };

  // Handing the code out once keeps a stale one from a previous attempt from
  // being exchanged silently: a second read reports pending, not the old code.
  const handleLastCallback = (req, res) => {
    res.setHeader('Cache-Control', 'no-store');

    if (isExpired()) {
      captured = undefined;
      return sendJson(res, 200, { pending: true });
    }

    const payload = { pending: false, ...captured };
    captured = undefined;
    return sendJson(res, 200, payload);
  };

  return { handleCallback, handleLastCallback };
};
