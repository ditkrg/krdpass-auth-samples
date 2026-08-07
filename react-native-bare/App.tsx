import * as KrdpassAuth from 'krdpass-auth-react-native';
import type {
  KrdpassTokenResult,
  KrdpassUserInfo,
} from 'krdpass-auth-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Linking, StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DashboardScreen } from './components/DashboardScreen';
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
 * A sign-in failure the user can act on, or `undefined` for one they cannot.
 *
 * `provider_not_installed` is the only authentication failure with a recovery step, and the
 * SDK hands the store URL over on both code paths: as `installUrl` on the typed
 * `AuthResult`, and as `KrdpassAuthError.installUrl` on the thrown error. Collapsing every
 * outcome into a message string is what throws that away.
 */
function installUrlFrom(error: unknown): string | undefined {
  return error instanceof KrdpassAuth.KrdpassAuthError
    ? error.installUrl
    : undefined;
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
  const [tokens, setTokens] = useState<KrdpassTokenResult>();
  const [userInfo, setUserInfo] = useState<KrdpassUserInfo>();
  const [useServerFlow, setUseServerFlow] = useState(true);
  const [includeCitizenScope, setIncludeCitizenScope] = useState(true);
  const [includeOfflineScope, setIncludeOfflineScope] = useState(true);
  const [isLoadingAction, setIsLoadingAction] = useState(false);
  const [isLoadingUserInfo, setIsLoadingUserInfo] = useState(false);
  const [error, setError] = useState<string>();
  const [installUrl, setInstallUrl] = useState<string>();
  const [actionMessage, setActionMessage] = useState<ActionMessage>();
  const messageTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

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
    messageTimer.current = setTimeout(() => setActionMessage(undefined), 3000);
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
   * Sign in, handling each authentication outcome on its own terms.
   *
   * The SDK returns a closed set of outcomes and both modes funnel into the same typed
   * error, so there is no reason to flatten them into one string:
   * a cancellation is not a failure, a timeout is retryable, and `provider_not_installed`
   * carries the store URL that fixes it.
   */
  const signIn = () => {
    setError(undefined);
    setInstallUrl(undefined);
    return runAction(async () => {
      let result: KrdpassTokenResult;
      const scopes = scopesFor(includeCitizenScope, includeOfflineScope);

      if (useServerFlow) {
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
          // Re-throw as the same typed error the direct signIn() path throws, so the
          // handler below sees one set of outcomes whichever mode ran. The install URL
          // rides along on provider_not_installed.
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
    useServerFlow
      ? AuthBackendService.refreshToken({
          environment: ENVIRONMENT,
          refreshToken,
          scope: scopesFor(includeCitizenScope, includeOfflineScope).join(' '),
        })
      : KrdpassAuth.refreshTokens({ refreshToken });

  /**
   * The access token to send with the next API call, refreshed first if it has expired.
   *
   * `KrdpassTokenResult.isExpired()` compares `receivedAt + expiresIn` against now, allowing
   * 60s of clock skew by default so a token that dies mid-flight does not slip through. This
   * is the one thing every production integration needs and the one thing a "tap to refresh"
   * button never demonstrates: expiry is handled where the token is used, not by a button the
   * user has to remember to press.
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
   * Refresh on demand, so the demo can show the exchange happening. Real code should not
   * need this button: validAccessToken() above refreshes on expiry at the point of use.
   */
  const refresh = () =>
    runAction(async () => {
      if (!tokens?.refreshToken) {
        showError('No refresh token available');
        return;
      }

      setTokens(await exchangeRefreshToken(tokens.refreshToken));
      showOk('Tokens refreshed');
    });

  const verify = () =>
    runAction(async () => {
      if (!tokens?.idToken) {
        showError('No ID token to verify');
        return;
      }

      await KrdpassAuth.verifyToken({ idToken: tokens.idToken });
      showOk('Token signature valid');
    });

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
      if (useServerFlow) {
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
    setTokens(undefined);
    setUserInfo(undefined);
    setError(undefined);
    setInstallUrl(undefined);
    setActionMessage(undefined);
  };

  const revoke = () =>
    runAction(async () => {
      if (!tokens) {
        showError('Sign in before revoking a token');
        return;
      }

      await revokeSessionTokens(tokens);
      clearSession();
    });

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
        <DashboardScreen
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
            setError(undefined);
            setInstallUrl(undefined);
          }}
          onOfflineScopeChange={setIncludeOfflineScope}
          onServerModeChange={setUseServerFlow}
          onSignIn={signIn}
          theme={theme}
          useServerMode={useServerFlow}
        />
      )}
    </SafeAreaProvider>
  );
}
