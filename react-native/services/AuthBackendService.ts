/**
 * Backend-mediated OAuth for Server Mode: the backend holds the client secret
 * and runs PAR and token exchange on behalf of this app.
 */
import { makeTokenResult } from 'krdpass-auth-react-native';
import type {
  KrdpassEnvironment,
  KrdpassTokenResult,
} from 'krdpass-auth-react-native';

import { BACKEND_URL } from '../config';

export interface ParResponse {
  requestUri: string;
  expiresIn?: number;
  state?: string;
}

// No local TokenResult interface: the SDK's KrdpassTokenResult carries `receivedAt` and
// `isExpired()`, which expiry handling needs, and makeTokenResult is what stamps receipt
// time from this device's clock. A hand-written interface plus a cast loses both silently.

/**
 * Prefer the OAuth `error_description`/`error` from the body; otherwise a
 * friendly label, never a raw 5xx HTML page.
 */
async function describeError(response: Response): Promise<string> {
  const body = await response.text();
  try {
    const json = JSON.parse(body);
    const detail = json.error_description || json.error;
    if (detail) return `${detail} (HTTP ${response.status})`;
  } catch {
    // Body was not JSON: fall through to a friendly label.
  }
  const status = response.status;
  const friendly =
    status >= 500
      ? 'The backend is unavailable right now. Make sure the backend server is running and reachable.'
      : status === 401 || status === 403
        ? 'The backend rejected this request (not authorized).'
        : status === 404
          ? 'Backend endpoint not found. Check the backend URL.'
          : response.statusText || 'Request failed';
  return `${friendly} (HTTP ${status})`;
}

const UNREACHABLE =
  "Can't reach the backend. Check your connection and that the server is running.";

async function readTokenResult(response: Response): Promise<KrdpassTokenResult> {
  const raw = await response.json();
  if (typeof raw?.accessToken !== 'string' || raw.accessToken.length === 0) {
    throw new Error('The backend returned no access token.');
  }
  return makeTokenResult(raw);
}

// POST JSON, mapping transport failures to a canonical message instead of the
// raw "Network request failed".
async function postJson(url: string, body: unknown): Promise<Response> {
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(UNREACHABLE);
  }
}

export class AuthBackendService {
  static async getRequestUri(params: {
    codeChallenge: string;
    state?: string;
    nonce?: string;
    environment: KrdpassEnvironment;
    redirectUri: string;
    scope?: string;
  }): Promise<ParResponse> {
    const environment = params.environment;
    const body = {
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: 'S256',
      environment,
      redirectUri: params.redirectUri,
      ...(params.state && { state: params.state }),
      ...(params.nonce && { nonce: params.nonce }),
      ...(params.scope && { scope: params.scope }),
    };

    const response = await postJson(`${BACKEND_URL}/oauth/par`, body);

    if (!response.ok) {
      throw new Error(await describeError(response));
    }

    const data = await response.json();
    if (data.error) {
      // Covers a deployment that answers 200 with an OAuth error body; the
      // reference server always uses a non-2xx status, caught above.
      throw new Error(
        `PAR request failed: ${data.error_description || data.error}`,
      );
    }

    // Fail here, not inside authenticate(): a PAR response without a requestUri
    // is a broken backend, and passing undefined along only moves the error
    // somewhere that no longer names the cause.
    if (typeof data.requestUri !== 'string' || !data.requestUri.trim()) {
      throw new Error("The backend's PAR response contained no requestUri.");
    }

    return {
      requestUri: data.requestUri,
      expiresIn: data.expiresIn,
      state: data.state,
    };
  }

  static async exchangeToken(params: {
    code: string;
    state: string;
    codeVerifier: string;
  }): Promise<KrdpassTokenResult> {
    const response = await postJson(`${BACKEND_URL}/oauth/token`, {
      code: params.code,
      state: params.state,
      codeVerifier: params.codeVerifier,
    });

    if (!response.ok) {
      throw new Error(await describeError(response));
    }

    return readTokenResult(response);
  }

  /**
   * `scope` is optional: an omitted scope asks CAS for the grant as issued
   * (RFC 6749 section 6), so the field is only sent when the caller has one.
   */
  static async refreshToken(params: {
    refreshToken: string;
    environment: KrdpassEnvironment;
    scope?: string;
  }): Promise<KrdpassTokenResult> {
    const response = await postJson(`${BACKEND_URL}/oauth/token/refresh`, {
      refreshToken: params.refreshToken,
      environment: params.environment,
      ...(params.scope && { scope: params.scope }),
    });

    if (!response.ok) {
      throw new Error(await describeError(response));
    }

    return readTokenResult(response);
  }

  static async revokeToken(params: {
    token: string;
    environment: KrdpassEnvironment;
    /**
     * Required, with no default: a "sign out" has to revoke the refresh token,
     * not just the access token, or the long-lived credential stays valid.
     */
    tokenTypeHint: 'access_token' | 'refresh_token';
  }): Promise<void> {
    const environment = params.environment;
    const body = {
      token: params.token,
      environment,
      tokenTypeHint: params.tokenTypeHint,
    };

    const response = await postJson(`${BACKEND_URL}/oauth/token/revoke`, body);

    if (!response.ok) {
      throw new Error(await describeError(response));
    }
  }
}
