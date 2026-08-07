import { StatusBar } from 'expo-status-bar';
import * as KrdpassAuth from 'krdpass-auth-react-native';
import {
  decodeTokenUnverified,
  generateState,
  GetUserInfoConfig,
  initialize,
  isAuthResultError,
  isAuthResultProviderNotInstalled,
  KrdpassAuthError,
  KrdpassScopes,
  VerifyTokenConfig,
} from 'krdpass-auth-react-native';
import type {
  KrdpassTokenResult,
  KrdpassUserInfo,
} from 'krdpass-auth-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Linking, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LandingScreen } from './components/LandingScreen';
import { LoggedInDashboard } from './components/LoggedInDashboard';
import { CLIENT_ID, ENVIRONMENT, REDIRECT_URI } from './config';
import { AuthBackendService } from './services/AuthBackendService';
import type { ActionMessage } from './components/TokenManagementCard';
import { DarkColors, LightColors } from './theme/colors';


function messageFor(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'The request could not be completed.';
}

// Display-only decode via the SDK's decoder (same as the Android/iOS/Flutter demos); tokens
// that aren't JWTs (e.g. an opaque access token) just show no claims.
const decodeJwtForDisplay = (token: string): Record<string, any> => {
  try {
    return decodeTokenUnverified(token);
  } catch {
    return {};
  }
};

// Initialize once: all SDK methods will use this config by default
initialize({
  clientId: CLIENT_ID,
  redirectUri: REDIRECT_URI,
  environment: ENVIRONMENT,
});

export default function App() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? DarkColors : LightColors;

  const [authResult, setAuthResult] = useState<KrdpassTokenResult | null>(null);
  const [userInfo, setUserInfo] = useState<KrdpassUserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingUserInfo, setIsLoadingUserInfo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installUrl, setInstallUrl] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<ActionMessage | null>(null);
  const statusIdRef = useRef(0);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the pending auto-dismiss on unmount, so the timer cannot fire a setState into a
  // component that is already gone.
  useEffect(
    () => () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    },
    [],
  );

  const [includeCitizenScope, setIncludeCitizenScope] = useState(true);
  const [includeOfflineScope, setIncludeOfflineScope] = useState(true);
  const [useServerMode, setUseServerMode] = useState(true);

  const idClaims = authResult?.idToken
    ? decodeJwtForDisplay(authResult.idToken)
    : {};
  const accessClaims = authResult?.accessToken
    ? decodeJwtForDisplay(authResult.accessToken)
    : {};
  const claims = { ...idClaims, ...accessClaims };

  const getScopes = () => {
    const scopes: string[] = [KrdpassScopes.openid, KrdpassScopes.profile];
    if (includeCitizenScope) scopes.push(KrdpassScopes.citizen_identity);
    if (includeOfflineScope) scopes.push(KrdpassScopes.offline_access);
    return scopes.join(' ');
  };

  /**
   * Sign in, handling each authentication outcome on its own terms.
   *
   * The SDK returns a closed set of outcomes and both modes funnel into the same typed
   * error, so there is no reason to flatten them into one string:
   * a cancellation is not a failure, a timeout is retryable, and `provider_not_installed`
   * carries the store URL that fixes it.
   */
  const handleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    setInstallUrl(null);
    try {
      if (useServerMode) {
        const pkcePair = await KrdpassAuth.generatePkcePair();
        const state = generateState();
        const nonce = generateState();

        const parResponse = await AuthBackendService.getRequestUri({
          codeChallenge: pkcePair.codeChallenge,
          environment: ENVIRONMENT,
          redirectUri: REDIRECT_URI,
          scope: getScopes(),
          state: state,
          nonce: nonce,
        });

        // The auth window matches the request_uri lifetime (floored at 1s), same as the
        // Android/iOS/Flutter demos.
        const authResponse = await KrdpassAuth.authenticate({
          requestUri: parResponse.requestUri,
          state: parResponse.state,
          timeout: Math.max(1, parResponse.expiresIn ?? 300),
        });

        if (isAuthResultError(authResponse)) {
          // Re-throw as the same typed error the direct signIn() path throws, so the
          // handler below sees one set of outcomes whichever mode ran. The install URL
          // rides along on provider_not_installed.
          throw new KrdpassAuthError(
            authResponse.error,
            authResponse.errorDescription,
            isAuthResultProviderNotInstalled(authResponse)
              ? authResponse.installUrl
              : undefined,
            authResponse.rawDescription,
          );
        }

        const tokens = await AuthBackendService.exchangeToken({
          code: authResponse.code,
          state: authResponse.state ?? parResponse.state ?? '',
          codeVerifier: pkcePair.codeVerifier,
        });

        setAuthResult(tokens);
      } else {
        // Direct mode (config comes from initialize())
        const result = await KrdpassAuth.signIn({
          scopes: getScopes(),
        });
        setAuthResult(result);
      }
    } catch (caught) {
      handleSignInError(caught);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignInError = (caught: unknown) => {
    const fallback =
      caught instanceof Error ? caught.message : 'Authentication failed.';
    if (!(caught instanceof KrdpassAuthError)) {
      setError(fallback);
      return;
    }

    switch (caught.code) {
      case 'cancelled':
      case 'access_denied':
        // The user backed out on purpose, so show nothing.
        return;
      case 'timeout':
        setError('KRDPASS did not respond in time. Try signing in again.');
        return;
      case 'busy':
        setError('A sign-in is already in progress. Finish or cancel it first.');
        return;
      case 'provider_not_installed':
        setError('KRDPASS is not installed on this device.');
        setInstallUrl(caught.installUrl ?? null);
        return;
      default:
        setError(fallback);
    }
  };

  const fetchUserInfo = async () => {
    if (!authResult) return;
    setIsLoadingUserInfo(true);
    try {
      const config: GetUserInfoConfig = {
        accessToken: authResult.accessToken,
      };
      const result = await KrdpassAuth.getUserInfo(config);
      setUserInfo(result);
      showOk('User info synced');
    } catch (caught) {
      showError(`Sync failed: ${messageFor(caught)}`);
    } finally {
      setIsLoadingUserInfo(false);
    }
  };

  /**
   * Manual refresh, wired to a button so the demo can show it on demand.
   *
   * A real app should not wait for a button: check `tokens.isExpired()` before every call
   * that carries the access token and refresh when it returns true. The iOS and bare React
   * Native samples in this repo do exactly that; see their `validAccessToken` helpers.
   */
  const handleRefreshToken = async () => {
    if (isLoading) return;
    if (!authResult?.refreshToken) {
      showError('No refresh token available');
      return;
    }
    setIsLoading(true);
    try {
      const refreshToken = authResult.refreshToken;
      const result = useServerMode
        ? await AuthBackendService.refreshToken({
            refreshToken,
            environment: ENVIRONMENT,
            scope: getScopes(),
          })
        : await KrdpassAuth.refreshTokens({ refreshToken });
      setAuthResult(result);
      showOk('Tokens refreshed');
    } catch (caught) {
      showError(`Refresh failed: ${messageFor(caught)}`);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Revoke the refresh token first, then the access token.
   *
   * Order matters: the refresh token is what lets a holder mint new access tokens, so it is
   * the credential an attacker wants. Revoking only the access token, which is what a
   * "logout" that clears local state effectively does, leaves the grant alive server-side.
   */
  const revokeSessionTokens = async (session: KrdpassTokenResult) => {
    const targets: [string, 'refresh_token' | 'access_token'][] = [
      ...(session.refreshToken
        ? ([[session.refreshToken, 'refresh_token']] as [
            string,
            'refresh_token',
          ][])
        : []),
      [session.accessToken, 'access_token'],
    ];

    for (const [token, tokenTypeHint] of targets) {
      if (useServerMode) {
        await AuthBackendService.revokeToken({
          token,
          environment: ENVIRONMENT,
          tokenTypeHint,
        });
      } else {
        await KrdpassAuth.revokeToken({ token, tokenTypeHint });
      }
    }
  };

  const handleRevokeToken = async () => {
    if (isLoading || !authResult) return;
    setIsLoading(true);
    try {
      await revokeSessionTokens(authResult);
      clearSession();
      showOk('Tokens revoked, signed out');
    } catch (caught) {
      // A failed revoke keeps the session (same as the Android/iOS/Flutter demos).
      showError(`Revoke failed: ${messageFor(caught)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyToken = async () => {
    if (isLoading) return;
    if (!authResult?.idToken) {
      showError('No ID token to verify');
      return;
    }
    try {
      setIsLoading(true);
      const config: VerifyTokenConfig = {
        idToken: authResult.idToken,
      };
      await KrdpassAuth.verifyToken(config);
      showOk('Token signature valid');
    } catch (caught) {
      showError(`Invalid: ${messageFor(caught)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const clearSession = () => {
    setAuthResult(null);
    setUserInfo(null);
    setError(null);
    setInstallUrl(null);
  };

  /**
   * Sign out.
   *
   * Clearing local state is the visible half. The half that matters is revoking the refresh
   * token, because a refresh token left alive keeps working long after the user believes
   * they signed out.
   *
   * Neither the SDK nor the reference BFF exposes an RP-initiated end-session endpoint, so
   * this is as far as a client can take it: the grant is revoked, but any access token
   * already issued stays valid until it expires. If your deployment adds an end-session
   * endpoint, call it here as well.
   */
  const handleLogout = () => {
    const session = authResult;
    clearSession();
    if (!session) return;
    // Best effort: local state is already gone and there is no screen left to retry from,
    // so never block sign-out on the network.
    revokeSessionTokens(session).catch(() => {});
  };

  const showOk = (text: string) => showStatus({ kind: 'ok', text });
  const showError = (text: string) => showStatus({ kind: 'error', text });

  const showStatus = (message: ActionMessage) => {
    // Monotonic id guards the auto-clear, so an older timer never wipes a newer message early.
    const id = ++statusIdRef.current;
    setActionMessage(message);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => {
      if (statusIdRef.current === id) setActionMessage(null);
    }, 3000);
  };

  if (!authResult) {
    return (
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <LandingScreen
          loading={isLoading}
          error={error}
          citizenScope={includeCitizenScope}
          offlineScope={includeOfflineScope}
          useServerMode={useServerMode}
          onCitizenScopeChange={setIncludeCitizenScope}
          onOfflineScopeChange={setIncludeOfflineScope}
          onServerModeChange={setUseServerMode}
          onSignIn={handleSignIn}
          onClearError={() => {
            setError(null);
            setInstallUrl(null);
          }}
          installUrl={installUrl}
          onInstallProvider={() => {
            if (installUrl) Linking.openURL(installUrl).catch(() => {});
          }}
          theme={theme}
        />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <LoggedInDashboard
        claims={claims}
        idClaims={idClaims}
        accessClaims={accessClaims}
        userInfo={userInfo}
        isLoadingUserInfo={isLoadingUserInfo}
        isLoadingAction={isLoading}
        onFetchUserInfo={fetchUserInfo}
        onLogout={handleLogout}
        onVerifyToken={handleVerifyToken}
        onRefreshToken={handleRefreshToken}
        onRevokeToken={handleRevokeToken}
        theme={theme}
        actionMessage={actionMessage}
      />
    </SafeAreaProvider>
  );
}
