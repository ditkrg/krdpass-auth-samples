import { StatusBar } from 'expo-status-bar';
import * as KrdpassAuth from 'krdpass-auth-react-native';
import { decodeTokenUnverified, generateState, GetUserInfoConfig, initialize, isAuthResultError, KrdpassScopes, RefreshTokensConfig, VerifyTokenConfig } from 'krdpass-auth-react-native';
import React, { useRef, useState } from 'react';
import {
    useColorScheme
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LandingScreen } from './components/LandingScreen';
import { LoggedInDashboard } from './components/LoggedInDashboard';
import { CLIENT_ID, ENVIRONMENT, REDIRECT_URI } from './config';
import { DarkColors, LightColors } from './theme/colors';

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
  // --- Theme State ---
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? DarkColors : LightColors;

  // --- Auth State ---
  const [authResult, setAuthResult] = useState<any>(null);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingUserInfo, setIsLoadingUserInfo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const statusIdRef = useRef(0);

  // --- Config State (Landing Screen) ---
  const [includeCitizenScope, setIncludeCitizenScope] = useState(true);
  const [includeOfflineScope, setIncludeOfflineScope] = useState(true);
  const [useServerMode, setUseServerMode] = useState(true); // Default to server mode

  // --- Derived State ---
  const idClaims = authResult?.idToken ? decodeJwtForDisplay(authResult.idToken) : {};
  const accessClaims = authResult?.accessToken ? decodeJwtForDisplay(authResult.accessToken) : {};
  // Merge claims for easier access in dashboard
  const claims = { ...idClaims, ...accessClaims };

  // --- Methods ---

  const getScopes = () => {
    const scopes: string[] = [KrdpassScopes.openid, KrdpassScopes.profile];
    if (includeCitizenScope) scopes.push(KrdpassScopes.citizen_identity);
    if (includeOfflineScope) scopes.push(KrdpassScopes.offline_access);
    return scopes.join(" ");
  };

  const handleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (useServerMode) {
        // Server-mediated flow
        // Dynamic import to support both environments if needed, though usually bundled
        const { AuthBackendService } = await import('./services/AuthBackendService');

        // Step 1: Generate PKCE
        const pkcePair = await KrdpassAuth.generatePkcePair();
        // Step 2: Call Backend PAR - use cryptographically secure random values
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

        // Step 3: Launch auth with requestUri. The auth window matches the request_uri
        // lifetime (floored at 1s), same as the Android/iOS/Flutter demos.
        const authResponse = await KrdpassAuth.authenticate({
          requestUri: parResponse.requestUri,
          state: parResponse.state,
          timeout: Math.max(1, parResponse.expiresIn ?? 300),
        });

        if (isAuthResultError(authResponse)) {
          setError(
            authResponse.errorDescription ??
              authResponse.error ??
              "Authentication failed",
          );
          return;
        }

        // Step 4: Exchange code via backend
        const tokens = await AuthBackendService.exchangeToken({
          code: authResponse.code,
          state: authResponse.state ?? parResponse.state ?? "",
          codeVerifier: pkcePair.codeVerifier,
          environment: ENVIRONMENT,
          redirectUri: REDIRECT_URI,
        });

        setAuthResult(tokens);
      } else {
        // Direct mode (config comes from initialize())
        const result = await KrdpassAuth.signIn({
          scopes: getScopes(),
        });
        setAuthResult(result);
      }
    } catch (e: any) {
      setError(e.message || "Authentication Failed");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserInfo = async () => {
    if (!authResult?.accessToken) return;
    setIsLoadingUserInfo(true);
    try {
      const config: GetUserInfoConfig = {
        accessToken: authResult.accessToken
      };
      const result = await KrdpassAuth.getUserInfo(config);
      setUserInfo(result);
      showStatus("✅ User Info Synced");
    } catch (e: any) {
      showStatus(`❌ Sync Failed: ${e.message}`);
    } finally {
      setIsLoadingUserInfo(false);
    }
  };

  const handleRefreshToken = async () => {
    if (isLoading) return;
    if (!authResult?.refreshToken) {
      showStatus("❌ No Refresh Token available");
      return;
    }
    setIsLoading(true); // Using global loading for card actions or we could have local loading logic
    try {
      if (useServerMode) {
        const { AuthBackendService } = await import('./services/AuthBackendService');
        const result = await AuthBackendService.refreshToken({
          refreshToken: authResult.refreshToken,
          environment: ENVIRONMENT,
          scope: getScopes(),
        });
        setAuthResult(result);
        showStatus("✅ Tokens Refreshed");
      } else {
        const config: RefreshTokensConfig = {
          refreshToken: authResult.refreshToken
        };
        const result = await KrdpassAuth.refreshTokens(config);
        setAuthResult(result);
        showStatus("✅ Tokens Refreshed");
      }
    } catch (e: any) {
      showStatus(`❌ Refresh Failed: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevokeToken = async () => {
    if (isLoading) return;
    if (!authResult?.accessToken) return;
    setIsLoading(true);
    try {
      if (useServerMode) {
        const { AuthBackendService } = await import('./services/AuthBackendService');
        await AuthBackendService.revokeToken({
          token: authResult.accessToken,
          environment: ENVIRONMENT,
          tokenTypeHint: "access_token",
        });
      } else {
        await KrdpassAuth.revokeToken({
          token: authResult.accessToken,
          tokenTypeHint: "access_token"
        });
      }
      handleLogout();
      showStatus("✅ Token Revoked (Logged Out)");
    } catch (e: any) {
      // A failed revoke keeps the session (same as the Android/iOS/Flutter demos).
      showStatus(`❌ Revoke Failed: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyToken = async () => {
    if (isLoading) return;
    if (authResult?.idToken) {
      try {
        setIsLoading(true);
        const config: VerifyTokenConfig = {
          idToken: authResult.idToken
        };
        await KrdpassAuth.verifyToken(config);
        showStatus("✅ Token Signature Valid");
      } catch (e: any) {
        showStatus(`❌ Invalid: ${e.message}`);
      } finally {
        setIsLoading(false);
      }
    } else {
      showStatus("❌ No ID Token to verify");
    }
  };

  const handleLogout = () => {
    setAuthResult(null);
    setUserInfo(null);
    setError(null);
  };

  const showStatus = (message: string) => {
    // Monotonic id guards the auto-clear, so an older timer never wipes a newer message early.
    const id = ++statusIdRef.current;
    setActionMessage(message);
    setTimeout(() => {
      if (statusIdRef.current === id) setActionMessage(null);
    }, 3000);
  };

  // --- Render ---

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
          onClearError={() => setError(null)}
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
