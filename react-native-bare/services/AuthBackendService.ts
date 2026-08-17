import { makeTokenResult } from 'krdpass-auth-react-native';
import type {
  KrdpassEnvironment,
  KrdpassTokenResult,
} from 'krdpass-auth-react-native';

import { BACKEND_URL } from '../config';

export interface ParResponse {
  expiresIn?: number;
  requestUri: string;
  state?: string;
}

async function describeError(response: Response): Promise<string> {
  const body = await response.text();
  try {
    const payload = JSON.parse(body) as {
      error?: string;
      error_description?: string;
    };
    const detail = payload.error_description || payload.error;
    if (detail) {
      return `${detail} (HTTP ${response.status})`;
    }
  } catch {
    // A non-JSON error page should not be shown to the user.
  }

  if (response.status >= 500) {
    return `The backend is unavailable right now. Make sure the backend server is running and reachable. (HTTP ${response.status})`;
  }
  if (response.status === 401 || response.status === 403) {
    return `The backend rejected this request (not authorized). (HTTP ${response.status})`;
  }
  if (response.status === 404) {
    return `Backend endpoint not found. Check the backend URL. (HTTP ${response.status})`;
  }
  return `${response.statusText || 'Request failed'} (HTTP ${response.status})`;
}

async function postJson(url: string, body: unknown): Promise<Response> {
  try {
    return await fetch(url, {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
  } catch {
    throw new Error(
      "Can't reach the backend. Check your connection and that the server is running.",
    );
  }
}

async function readTokenResult(response: Response): Promise<KrdpassTokenResult> {
  const raw = await response.json();
  if (typeof raw?.accessToken !== 'string' || raw.accessToken.length === 0) {
    throw new Error('The backend returned no access token.');
  }
  return makeTokenResult(raw);
}

export class AuthBackendService {
  static async getRequestUri(params: {
    codeChallenge: string;
    environment: KrdpassEnvironment;
    nonce: string;
    redirectUri: string;
    scope: string;
    state: string;
  }): Promise<ParResponse> {
    const response = await postJson(`${BACKEND_URL}/oauth/par`, {
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: 'S256',
      environment: params.environment,
      nonce: params.nonce,
      redirectUri: params.redirectUri,
      scope: params.scope,
      state: params.state,
    });
    if (!response.ok) {
      throw new Error(await describeError(response));
    }

    // Read the three fields this sample uses rather than casting the whole body:
    // a cast would claim `requestUri` exists on a response that never carried it.
    const data = await response.json();

    // Fail here, not inside authenticate(): a PAR response without a requestUri
    // is a broken backend, and passing undefined along only moves the error
    // somewhere that no longer names the cause.
    if (typeof data.requestUri !== 'string' || !data.requestUri.trim()) {
      throw new Error("The backend's PAR response contained no requestUri.");
    }

    return {
      expiresIn: data.expiresIn,
      requestUri: data.requestUri,
      state: data.state,
    };
  }

  static async exchangeToken(params: {
    code: string;
    codeVerifier: string;
    state: string;
  }): Promise<KrdpassTokenResult> {
    const response = await postJson(`${BACKEND_URL}/oauth/token`, {
      code: params.code,
      codeVerifier: params.codeVerifier,
      state: params.state,
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
    environment: KrdpassEnvironment;
    refreshToken: string;
    scope?: string;
  }): Promise<KrdpassTokenResult> {
    const response = await postJson(`${BACKEND_URL}/oauth/token/refresh`, {
      environment: params.environment,
      refreshToken: params.refreshToken,
      ...(params.scope && { scope: params.scope }),
    });
    if (!response.ok) {
      throw new Error(await describeError(response));
    }

    return readTokenResult(response);
  }

  static async revokeToken(params: {
    environment: KrdpassEnvironment;
    token: string;
    /**
     * Required, with no default: a "sign out" has to revoke the refresh token,
     * not just the access token, or the long-lived credential stays valid.
     */
    tokenTypeHint: 'access_token' | 'refresh_token';
  }): Promise<void> {
    const response = await postJson(`${BACKEND_URL}/oauth/token/revoke`, {
      environment: params.environment,
      token: params.token,
      tokenTypeHint: params.tokenTypeHint,
    });
    if (!response.ok) {
      throw new Error(await describeError(response));
    }
  }
}
