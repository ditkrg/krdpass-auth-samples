import * as KrdpassAuth from 'krdpass-auth-react-native';
import type {
  KrdpassTokenResult,
  KrdpassUserInfo,
} from 'krdpass-auth-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Linking, StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LoggedInDashboard } from './components/LoggedInDashboard';
import { LandingScreen } from './components/LandingScreen';
import { CLIENT_ID, ENVIRONMENT, REDIRECT_URI } from './config';
import { AuthBackendService } from './services/AuthBackendService';
import { DarkTheme, LightTheme } from './theme';
import type { ActionMessage } from './components/DemoUi';

const scopesFor = (includeCitizen: boolean, includeOffline: boolean) => [
  KrdpassAuth.KrdpassScopes.openid,
  KrdpassAuth.KrdpassScopes.profile,
  ...(includeCitizen ? [KrdpassAuth.KrdpassScopes.citizen_identity] : []),
  ...(includeOffline ? [KrdpassAuth.KrdpassScopes.offline_access] : []),
];

KrdpassAuth.initialize({
  clientId: CLIENT_ID,
  redirectUri: REDIRECT_URI,
  environment: ENVIRONMENT,
});

function messageFor(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'The request could not be completed.';
}

/**
 * A sign-in failure the user can act on, or `null` for one they cannot.
 * `provider_not_installed` is the only auth failure with a recovery step, and
 * the SDK carries the store URL on the thrown error.
 */
function installUrlFrom(error: unknown): string | null {
  return error instanceof KrdpassAuth.KrdpassAuthError
    ? error.installUrl ?? null
    : null;
}

function decodeForDisplay(token?: string): Record<string, unknown> {
  if (!token) {
    return {};
  }

  try {
    return KrdpassAuth.decodeTokenUnverified(token);
  } catch {
    return {};
  }
}

export default function App() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? DarkTheme : LightTheme;
  const [tokens, setTokens] = useState<KrdpassTokenResult | null>(null);
  const [userInfo, setUserInfo] = useState<KrdpassUserInfo | null>(null);
  const [useServerMode, setUseServerMode] = useState(true);
  const [includeCitizenScope, setIncludeCitizenScope] = useState(true);
  const [includeOfflineScope, setIncludeOfflineScope] = useState(true);
  const [isLoadingAction, setIsLoadingAction] = useState(false);
  const [isLoadingUserInfo, setIsLoadingUserInfo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installUrl, setInstallUrl] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<ActionMessage | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (messageTimer.current) {
        clearTimeout(messageTimer.current);
      }
    },
    [],
  );

  const showOk = (text: string) => showActionMessage({ kind: 'ok', text });
  const showError = (text: string) => showActionMessage({ kind: 'error', text });

  const showActionMessage = (message: ActionMessage) => {
    if (messageTimer.current) {
      clearTimeout(messageTimer.current);
    }
    setActionMessage(message);
    messageTimer.current = setTimeout(() => setActionMessage(null), 3000);
  };

  const runAction = async (
    action: () => Promise<void>,
    onError: (message: string, caught: unknown) => void = showError,
  ) => {
    if (isLoadingAction) {
      return;
    }

    setIsLoadingAction(true);
    try {
      await action();
    } catch (caught) {
      onError(messageFor(caught), caught);
    } finally {
      setIsLoadingAction(false);
    }
  };

  /**
   * Sign in, handling each outcome on its own terms: a cancellation is not a
   * failure, a timeout is retryable, and `provider_not_installed` carries the
   * store URL that fixes it.
   */
  const signIn = () => {
    setError(null);
    setInstallUrl(null);
    return runAction(async () => {
      let result: KrdpassTokenResult;
      const scopes = scopesFor(includeCitizenScope, includeOfflineScope);

      if (useServerMode) {
        const pkce = await KrdpassAuth.generatePkcePair();
        const state = KrdpassAuth.generateState();
        const par = await AuthBackendService.getRequestUri({
          codeChallenge: pkce.codeChallenge,
          environment: ENVIRONMENT,
          nonce: KrdpassAuth.generateState(),
          redirectUri: REDIRECT_URI,
          scope: scopes.join(' '),
          state,
        });
        const authorization = await KrdpassAuth.authenticate({
          requestUri: par.requestUri,
          state: par.state ?? state,
          timeout: Math.max(1, par.expiresIn ?? 300),
        });

        if (KrdpassAuth.isAuthResultError(authorization)) {
          // Re-throw as the same typed error the direct signIn() path throws,
          // so the handler below sees one set of outcomes whichever mode ran.
          throw new KrdpassAuth.KrdpassAuthError(
            authorization.error,
            authorization.errorDescription,
            KrdpassAuth.isAuthResultProviderNotInstalled(authorization)
              ? authorization.installUrl
              : undefined,
            authorization.rawDescription,
          );
        }

        result = await AuthBackendService.exchangeToken({
          code: authorization.code,
          codeVerifier: pkce.codeVerifier,
          state: authorization.state ?? par.state ?? state,
        });
      } else {
        result = await KrdpassAuth.signIn({ scopes });
      }

      setTokens(result);
    }, handleSignInError);
  };

  const handleSignInError = (message: string, caught: unknown) => {
    if (!(caught instanceof KrdpassAuth.KrdpassAuthError)) {
      setError(message);
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
        setInstallUrl(installUrlFrom(caught));
        return;
      default:
        setError(message);
    }
  };

  /**
   * Exchange the refresh token for a new token set, via the backend or the SDK.
   */
  const exchangeRefreshToken = (refreshToken: string) =>
    useServerMode
      ? AuthBackendService.refreshToken({
          environment: ENVIRONMENT,
          refreshToken,
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

  const getUserInfo = async () => {
    if (!tokens || isLoadingUserInfo) {
      return;
    }

    setIsLoadingUserInfo(true);
    try {
      // Note this goes through validAccessToken, not through tokens.accessToken.
      const accessToken = await validAccessToken(tokens);
      setUserInfo(await KrdpassAuth.getUserInfo({ accessToken }));
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
  const refresh = () =>
    runAction(
      async () => {
        if (!tokens?.refreshToken) {
          showError('No refresh token available');
          return;
        }

        setTokens(await exchangeRefreshToken(tokens.refreshToken));
        showOk('Tokens refreshed');
      },
      message => showError(`Refresh failed: ${message}`),
    );

  const verify = () =>
    runAction(
      async () => {
        if (!tokens?.idToken) {
          showError('No ID token to verify');
          return;
        }

        await KrdpassAuth.verifyToken({ idToken: tokens.idToken });
        showOk('Token signature valid');
      },
      message => showError(`Invalid: ${message}`),
    );

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
          environment: ENVIRONMENT,
          token,
          tokenTypeHint,
        });
      } else {
        await KrdpassAuth.revokeToken({ token, tokenTypeHint });
      }
    }
  };

  const clearSession = () => {
    setTokens(null);
    setUserInfo(null);
    setError(null);
    setInstallUrl(null);
    setActionMessage(null);
  };

  const revoke = () =>
    runAction(
      async () => {
        if (!tokens) {
          showError('No token to revoke');
          return;
        }

        await revokeSessionTokens(tokens);
        clearSession();
        // After clearSession, which resets the status line as part of the wipe.
        showOk('Tokens revoked, signed out');
      },
      message => showError(`Revoke failed: ${message}`),
    );

  /**
   * Sign out. Clearing local state is the visible half; the half that matters
   * is revoking the refresh token, which would otherwise keep working. There is
   * no end-session endpoint here, so issued access tokens stay valid until they
   * expire; if your deployment adds one, call it here as well.
   */
  const signOut = () => {
    const session = tokens;
    clearSession();
    if (!session) {
      return;
    }
    // Best effort: local state is already gone and there is no screen left to retry from,
    // so never block sign-out on the network.
    revokeSessionTokens(session).catch(() => {});
  };

  const idClaims = decodeForDisplay(tokens?.idToken);
  const accessClaims = decodeForDisplay(tokens?.accessToken);
  const claims = { ...idClaims, ...accessClaims };

  return (
    <SafeAreaProvider>
      <StatusBar
        backgroundColor={theme.background}
        barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'}
      />
      {tokens ? (
        <LoggedInDashboard
          accessClaims={accessClaims}
          actionMessage={actionMessage}
          claims={claims}
          idClaims={idClaims}
          isLoadingAction={isLoadingAction}
          isLoadingUserInfo={isLoadingUserInfo}
          onFetchUserInfo={getUserInfo}
          onLogout={signOut}
          onRefreshToken={refresh}
          onRevokeToken={revoke}
          onVerifyToken={verify}
          theme={theme}
          userInfo={userInfo}
        />
      ) : (
        <LandingScreen
          citizenScope={includeCitizenScope}
          error={error}
          installUrl={installUrl}
          onInstallProvider={() => {
            if (installUrl) {
              Linking.openURL(installUrl).catch(() => {});
            }
          }}
          loading={isLoadingAction}
          offlineScope={includeOfflineScope}
          onCitizenScopeChange={setIncludeCitizenScope}
          onClearError={() => {
            setError(null);
            setInstallUrl(null);
          }}
          onOfflineScopeChange={setIncludeOfflineScope}
          onServerModeChange={setUseServerMode}
          onSignIn={signIn}
          theme={theme}
          useServerMode={useServerMode}
        />
      )}
    </SafeAreaProvider>
  );
}
