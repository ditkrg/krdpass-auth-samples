import { StatusBar } from 'expo-status-bar';
import * as KrdpassAuth from 'krdpass-auth-react-native';
import {
  decodeTokenUnverified,
  generateState,
  initialize,
  isAuthResultError,
  isAuthResultProviderNotInstalled,
  KrdpassAuthError,
  KrdpassScopes,
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

// Display-only decode; tokens that aren't JWTs (e.g. an opaque access token)
// just show no claims.
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

  const [tokens, setTokens] = useState<KrdpassTokenResult | null>(null);
  const [userInfo, setUserInfo] = useState<KrdpassUserInfo | null>(null);
  const [isLoadingAction, setIsLoadingAction] = useState(false);
  const [isLoadingUserInfo, setIsLoadingUserInfo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installUrl, setInstallUrl] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<ActionMessage | null>(null);
  const statusIdRef = useRef(0);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The timer must not fire a setState into an unmounted component.
  useEffect(
    () => () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    },
    [],
  );

  const [includeCitizenScope, setIncludeCitizenScope] = useState(true);
  const [includeOfflineScope, setIncludeOfflineScope] = useState(true);
  const [useServerMode, setUseServerMode] = useState(true);

  const idClaims = tokens?.idToken
    ? decodeJwtForDisplay(tokens.idToken)
    : {};
  const accessClaims = tokens?.accessToken
    ? decodeJwtForDisplay(tokens.accessToken)
    : {};
  const claims = { ...idClaims, ...accessClaims };

  const getScopes = () => {
    const scopes: string[] = [KrdpassScopes.openid, KrdpassScopes.profile];
    if (includeCitizenScope) scopes.push(KrdpassScopes.citizen_identity);
    if (includeOfflineScope) scopes.push(KrdpassScopes.offline_access);
    return scopes.join(' ');
  };

  /**
   * Sign in, handling each outcome on its own terms: a cancellation is not a
   * failure, a timeout is retryable, and `provider_not_installed` carries the
   * store URL that fixes it.
   */
  const handleSignIn = async () => {
    if (isLoadingAction) return;
    setIsLoadingAction(true);
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
          state,
          nonce,
        });

        // The auth window matches the request_uri lifetime (floored at 1s), same as the
        // Android/iOS/Flutter demos.
        const authResponse = await KrdpassAuth.authenticate({
          requestUri: parResponse.requestUri,
          // The backend echoes the state it bound to the request; fall back to the one we
          // generated rather than dropping the CSRF binding.
          state: parResponse.state ?? state,
          timeout: Math.max(1, parResponse.expiresIn ?? 300),
        });

        if (isAuthResultError(authResponse)) {
          // Re-throw as the same typed error the direct signIn() path throws,
          // so the handler below sees one set of outcomes whichever mode ran.
          throw new KrdpassAuthError(
            authResponse.error,
            authResponse.errorDescription,
            isAuthResultProviderNotInstalled(authResponse)
              ? authResponse.installUrl
              : undefined,
            authResponse.rawDescription,
          );
        }

        // Fall back to the state we generated, never to '': the server rejects a blank
        // state, and ours is the one the backend bound to the request.
        const result = await AuthBackendService.exchangeToken({
          code: authResponse.code,
          state: authResponse.state ?? parResponse.state ?? state,
          codeVerifier: pkcePair.codeVerifier,
        });

        setTokens(result);
      } else {
        // Direct mode (config comes from initialize())
        const result = await KrdpassAuth.signIn({
          scopes: getScopes(),
        });
        setTokens(result);
      }
    } catch (caught) {
      handleSignInError(caught);
    } finally {
      setIsLoadingAction(false);
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
        // The user backed out on purpose (including a Deny reported on the redirect:
        // both cores canonicalize the OAuth aliases to 'cancelled'), so show nothing.
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

  /**
   * Exchange the refresh token for a new token set, via the backend or the SDK.
   */
  const exchangeRefreshToken = (refreshToken: string) =>
    useServerMode
      ? AuthBackendService.refreshToken({
          refreshToken,
          environment: ENVIRONMENT,
          // The scope CAS granted this session, never the live UI toggles: refreshing with
          // the toggles would silently narrow (or widen) the grant mid-session. When the
          // token response carried no scope the field is omitted, which per RFC 6749
          // section 6 means the grant as issued.
          scope: tokens?.scope,
        })
      : KrdpassAuth.refreshTokens({ refreshToken, scope: tokens?.scope });

  /**
   * The access token to send with the next API call, refreshed first if it has
   * expired. Expiry is handled here, where the token is used, not by a button
   * the user has to remember to press; `isExpired()` allows 60s of clock skew.
   */
  const validAccessToken = async (
    current: KrdpassTokenResult,
  ): Promise<string> => {
    if (!current.isExpired()) {
      return current.accessToken;
    }
    if (!current.refreshToken) {
      // No offline_access scope, so there is nothing to refresh with.
      throw new Error('Session expired. Sign in again.');
    }
    const refreshed = await exchangeRefreshToken(current.refreshToken);
    setTokens(refreshed);
    return refreshed.accessToken;
  };

  const fetchUserInfo = async () => {
    if (!tokens || isLoadingUserInfo) return;
    setIsLoadingUserInfo(true);
    try {
      // Note this goes through validAccessToken, not through tokens.accessToken.
      const result = await KrdpassAuth.getUserInfo({
        accessToken: await validAccessToken(tokens),
      });
      setUserInfo(result);
      showOk('User info synced');
    } catch (caught) {
      showError(`Sync failed: ${messageFor(caught)}`);
    } finally {
      setIsLoadingUserInfo(false);
    }
  };

  /**
   * Refresh on demand, so the demo can show the exchange happening. Real code
   * should not need this button: validAccessToken() refreshes at the point of use.
   */
  const handleRefreshToken = async () => {
    if (isLoadingAction) return;
    if (!tokens?.refreshToken) {
      showError('No refresh token available');
      return;
    }
    setIsLoadingAction(true);
    try {
      setTokens(await exchangeRefreshToken(tokens.refreshToken));
      showOk('Tokens refreshed');
    } catch (caught) {
      showError(`Refresh failed: ${messageFor(caught)}`);
    } finally {
      setIsLoadingAction(false);
    }
  };

  /**
   * Revoke the refresh token first, then the access token. Order matters: the
   * refresh token is what mints new access tokens, and revoking only the access
   * token leaves the grant alive server-side.
   */
  const revokeSessionTokens = async (session: KrdpassTokenResult) => {
    const targets: [string, 'refresh_token' | 'access_token'][] =
      session.refreshToken
        ? [
            [session.refreshToken, 'refresh_token'],
            [session.accessToken, 'access_token'],
          ]
        : [[session.accessToken, 'access_token']];

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
    if (isLoadingAction || !tokens) return;
    setIsLoadingAction(true);
    try {
      await revokeSessionTokens(tokens);
      clearSession();
      showOk('Tokens revoked, signed out');
    } catch (caught) {
      // A failed revoke keeps the session (same as the Android/iOS/Flutter demos).
      showError(`Revoke failed: ${messageFor(caught)}`);
    } finally {
      setIsLoadingAction(false);
    }
  };

  const handleVerifyToken = async () => {
    if (isLoadingAction) return;
    if (!tokens?.idToken) {
      showError('No ID token to verify');
      return;
    }
    try {
      setIsLoadingAction(true);
      await KrdpassAuth.verifyToken({ idToken: tokens.idToken });
      showOk('Token signature valid');
    } catch (caught) {
      showError(`Invalid: ${messageFor(caught)}`);
    } finally {
      setIsLoadingAction(false);
    }
  };

  const clearSession = () => {
    setTokens(null);
    setUserInfo(null);
    setError(null);
    setInstallUrl(null);
    setActionMessage(null);
  };

  /**
   * Sign out. Clearing local state is the visible half; the half that matters
   * is revoking the refresh token, which would otherwise keep working. There is
   * no end-session endpoint here, so issued access tokens stay valid until they
   * expire; if your deployment adds one, call it here as well.
   */
  const handleLogout = () => {
    const session = tokens;
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

  if (!tokens) {
    return (
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <LandingScreen
          loading={isLoadingAction}
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
        isLoadingAction={isLoadingAction}
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
