import * as KrdpassAuth from 'krdpass-auth-react-native';
import type {
  KrdpassTokenResult,
  KrdpassUserInfo,
} from 'krdpass-auth-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DashboardScreen } from './components/DashboardScreen';
import { LandingScreen } from './components/LandingScreen';
import { CLIENT_ID, ENVIRONMENT, REDIRECT_URI } from './config';
import { AuthBackendService } from './services/AuthBackendService';
import { DarkTheme, LightTheme } from './theme';

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
  const [actionMessage, setActionMessage] = useState<string>();
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

  const showActionMessage = (message: string) => {
    if (messageTimer.current) {
      clearTimeout(messageTimer.current);
    }
    setActionMessage(message);
    messageTimer.current = setTimeout(() => setActionMessage(undefined), 3000);
  };

  const runAction = async (
    action: () => Promise<void>,
    onError: (message: string) => void = message =>
      showActionMessage(`❌ ${message}`),
  ) => {
    if (isLoadingAction) {
      return;
    }

    setIsLoadingAction(true);
    try {
      await action();
    } catch (caught) {
      onError(messageFor(caught));
    } finally {
      setIsLoadingAction(false);
    }
  };

  const signIn = () => {
    setError(undefined);
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
          throw new Error(
            authorization.errorDescription ??
              authorization.error ??
              'Authentication failed.',
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
    }, setError);
  };

  const getUserInfo = async () => {
    if (!tokens?.accessToken || isLoadingUserInfo) {
      return;
    }

    setIsLoadingUserInfo(true);
    try {
      setUserInfo(
        await KrdpassAuth.getUserInfo({ accessToken: tokens.accessToken }),
      );
      showActionMessage('✅ User Info Synced');
    } catch (caught) {
      showActionMessage(`❌ Sync Failed: ${messageFor(caught)}`);
    } finally {
      setIsLoadingUserInfo(false);
    }
  };

  const refresh = () =>
    runAction(async () => {
      if (!tokens?.refreshToken) {
        showActionMessage('❌ No Refresh Token available');
        return;
      }

      const result = useServerFlow
        ? await AuthBackendService.refreshToken({
            environment: ENVIRONMENT,
            refreshToken: tokens.refreshToken,
            scope: scopesFor(includeCitizenScope, includeOfflineScope).join(
              ' ',
            ),
          })
        : await KrdpassAuth.refreshTokens({
            refreshToken: tokens.refreshToken,
          });

      setTokens(result);
      showActionMessage('✅ Tokens Refreshed');
    });

  const verify = () =>
    runAction(async () => {
      if (!tokens?.idToken) {
        showActionMessage('❌ No ID Token to verify');
        return;
      }

      await KrdpassAuth.verifyToken({ idToken: tokens.idToken });
      showActionMessage('✅ Token Signature Valid');
    });

  const revoke = () =>
    runAction(async () => {
      if (!tokens?.accessToken) {
        showActionMessage('❌ Sign in before revoking a token');
        return;
      }

      if (useServerFlow) {
        await AuthBackendService.revokeToken({
          environment: ENVIRONMENT,
          token: tokens.accessToken,
        });
      } else {
        await KrdpassAuth.revokeToken({
          token: tokens.accessToken,
          tokenTypeHint: 'access_token',
        });
      }

      setTokens(undefined);
      setUserInfo(undefined);
      setActionMessage(undefined);
    });

  const signOut = () => {
    setTokens(undefined);
    setUserInfo(undefined);
    setError(undefined);
    setActionMessage(undefined);
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
          loading={isLoadingAction}
          offlineScope={includeOfflineScope}
          onCitizenScopeChange={setIncludeCitizenScope}
          onClearError={() => setError(undefined)}
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
