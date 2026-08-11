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
    const detail = payload.error_description ?? payload.error;
    if (detail) {
      return `${detail} (HTTP ${response.status})`;
    }
  } catch {
    // A non-JSON error page should not be shown to the user.
  }

  if (response.status >= 500) {
    return `The backend is unavailable right now (HTTP ${response.status}).`;
  }
  return response.statusText || `Request failed (HTTP ${response.status}).`;
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
      'Cannot reach the sample backend. Check the device connection and server URL.',
    );
  }
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

    // makeTokenResult, not a cast: the BFF's JSON has no receivedAt and no isExpired,
    // so casting it to KrdpassTokenResult compiles and then throws at the first
    // isExpired() call. The SDK stamps receipt time on this device.
    return makeTokenResult(await response.json());
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

    return makeTokenResult(await response.json());
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
