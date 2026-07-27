/**
 * AuthBackendService - Handles backend-mediated OAuth flows for Server Mode
 *
 * This service mirrors the Flutter AuthBackendService and communicates with
 * a backend server that handles PAR and token exchange on behalf of the client.
 */
import type { KrdpassEnvironment } from 'krdpass-auth-react-native';

import { BACKEND_URL } from '../config';

export interface ParResponse {
  requestUri: string;
  expiresIn?: number;
  state?: string;
}

export interface TokenResult {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
  scope?: string;
}

/**
 * Turn a failed HTTP response into a human-readable message. Prefers the OAuth
 * `error_description`/`error` from the response body; otherwise falls back to a
 * friendly label for common status families (e.g. an unreachable backend
 * returns a 5xx HTML page we don't want to surface verbatim).
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

/**
 * POST JSON, mapping transport failures (server down / no network) to a
 * canonical message instead of leaking the raw "Network request failed".
 */
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
  /**
   * Request a PAR URI from the backend.
   * The backend will forward this to the OIDC provider and return the requestUri.
   */
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
      throw new Error(`PAR request failed: ${data.error}`);
    }

    return {
      requestUri: data.requestUri,
      expiresIn: data.expiresIn,
      state: data.state,
    };
  }

  /**
   * Exchange authorization code for tokens via the backend.
   * The backend will handle the token exchange with the OIDC provider.
   */
  static async exchangeToken(params: {
    code: string;
    state: string;
    codeVerifier: string;
  }): Promise<TokenResult> {
    const response = await postJson(`${BACKEND_URL}/oauth/token`, {
      code: params.code,
      state: params.state,
      codeVerifier: params.codeVerifier,
    });

    if (!response.ok) {
      throw new Error(await describeError(response));
    }

    return await response.json();
  }

  /**
   * Refresh tokens via the backend.
   */
  static async refreshToken(params: {
    refreshToken: string;
    environment: KrdpassEnvironment;
    scope?: string;
  }): Promise<TokenResult> {
    const environment = params.environment;
    const body = {
      refreshToken: params.refreshToken,
      environment,
      ...(params.scope && { scope: params.scope }),
    };

    const response = await postJson(`${BACKEND_URL}/oauth/token/refresh`, body);

    if (!response.ok) {
      throw new Error(await describeError(response));
    }

    return await response.json();
  }

  /**
   * Revoke a token via the backend.
   */
  static async revokeToken(params: {
    token: string;
    environment: KrdpassEnvironment;
    tokenTypeHint?: string;
  }): Promise<void> {
    const environment = params.environment;
    const body = {
      token: params.token,
      environment,
      tokenTypeHint: params.tokenTypeHint ?? 'access_token',
    };

    const response = await postJson(`${BACKEND_URL}/oauth/token/revoke`, body);

    if (!response.ok) {
      throw new Error(await describeError(response));
    }
  }
}
