import 'package:demo_krdpass_auth/config.dart';
import 'package:demo_krdpass_auth/models/action_message.dart';
import 'package:demo_krdpass_auth/services/auth_backend_service.dart';
import 'package:demo_krdpass_auth/widgets/authenticated_view.dart';
import 'package:demo_krdpass_auth/widgets/login_view.dart';
import 'package:flutter/material.dart';
import 'package:krdpass_auth_flutter/krdpass_auth_flutter.dart';

String _describe(Object e) => switch (e) {
  KrdpassException(:final message) => message,
  BackendException(:final message) => message,
  _ => e.toString(),
};

class _AuthResult {
  final String accessToken;
  final String? idToken;
  final String? refreshToken;

  const _AuthResult(this.accessToken, this.idToken, this.refreshToken);
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  bool _isLoggedIn = false;
  bool _isLoading = false;
  String? _authToken;
  String? _idToken;
  String? _refreshToken;
  String? _error;

  /// Store listing for the KRDPASS app, set only when sign-in failed with
  /// `provider_not_installed`. It is the one auth failure the user can fix, so
  /// the UI shows it instead of leaving them at a dead end.
  String? _installUrl;
  ActionMessage? _actionMessage;

  KrdpassUserInfo? _userInfo;
  bool _isLoadingUserInfo = false;
  bool _includeCitizenScope = true;
  bool _includeOfflineScope = true;
  bool _useServerMode = true;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: _isLoggedIn
              ? AuthenticatedView(
                  authToken: _authToken,
                  idToken: _idToken,
                  userInfo: _userInfo,
                  isLoadingUserInfo: _isLoadingUserInfo,
                  onFetchUserInfo: _handleFetchUserInfo,
                  onLogout: _handleLogout,
                  onVerifyToken: () => _handleVerifyToken(),
                  onRefreshToken: _handleRefreshToken,
                  onRevokeToken: _handleRevokeToken,
                  actionMessage: _actionMessage,
                )
              : LandingScreen(
                  loading: _isLoading,
                  error: _error,
                  installUrl: _installUrl,
                  citizenScope: _includeCitizenScope,
                  offlineScope: _includeOfflineScope,
                  useServerMode: _useServerMode,
                  onCitizenScopeChange: (val) =>
                      setState(() => _includeCitizenScope = val),
                  onOfflineScopeChange: (val) =>
                      setState(() => _includeOfflineScope = val),
                  onServerModeChange: (val) =>
                      setState(() => _useServerMode = val),
                  onSignInClick: () => _handleSignIn(_useServerMode),
                  onClearError: () => setState(() {
                    _error = null;
                    _installUrl = null;
                  }),
                ),
        ),
      ),
    );
  }

  /// Sign in, handling each authentication outcome on its own terms.
  ///
  /// `KrdpassException` is a sealed hierarchy, so the switch below is exhaustive and
  /// there is no reason to flatten it into one string: a cancellation is not a failure,
  /// a timeout is retryable, and `provider_not_installed` carries the install URL that
  /// fixes it.
  Future<void> _handleSignIn(bool useServerMode) async {
    if (_isLoading) return;
    setState(() {
      _isLoading = true;
      _error = null;
      _installUrl = null;
    });
    try {
      final authResult = await (useServerMode
          ? _loginServerMode()
          : _loginClientMode());
      if (!mounted) return;
      setState(() {
        _authToken = authResult.accessToken;
        _idToken = authResult.idToken;
        _refreshToken = authResult.refreshToken;
        _isLoggedIn = true;
      });
    } on KrdpassCancelledException {
      // The user backed out on purpose: drop the spinner, show no error.
    } on KrdpassTimeoutException {
      if (!mounted) return;
      setState(
        () => _error =
            'KRDPASS did not respond in time. Try signing in again.',
      );
    } on KrdpassBusyException {
      if (!mounted) return;
      setState(
        () => _error =
            'A sign-in is already in progress. Finish or cancel it first.',
      );
    } on KrdpassAuthenticationException catch (e) {
      // installUrl is non-null only for provider_not_installed. Passing it
      // through is what turns "something went wrong" into a working next step.
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _installUrl = e.installUrl;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = _describe(e));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleFetchUserInfo() async {
    if (_authToken == null) return;
    setState(() => _isLoadingUserInfo = true);
    try {
      final info = await KrdpassAuth.instance.getUserInfo(
        accessToken: _authToken!,
      );
      if (!mounted) return;
      setState(() => _userInfo = info);
      _showStatus(const ActionMessage.ok('User info synced'));
    } catch (e) {
      _showStatus(ActionMessage.failed('Sync failed: ${_describe(e)}'));
    } finally {
      if (mounted) setState(() => _isLoadingUserInfo = false);
    }
  }

  /// Manual refresh, wired to a button so the demo can show it on demand.
  ///
  /// A real app should not wait for a button: check `tokens.isExpired` before
  /// every call that carries the access token and refresh when it returns true.
  /// The iOS and bare React Native samples in this repo do exactly that.
  Future<void> _handleRefreshToken() async {
    if (_isLoading) return;
    if (_refreshToken == null) {
      _showStatus(const ActionMessage.failed('No refresh token available'));
      return;
    }
    setState(() => _isLoading = true);
    try {
      KrdpassTokenResult newTokens;
      if (_useServerMode) {
        newTokens = await AuthBackendService.refreshToken(
          refreshToken: _refreshToken!,
          environment: KrdpassAuth.instance.config.environment.name,
        );
      } else {
        newTokens = await KrdpassAuth.instance.refreshTokens(
          refreshToken: _refreshToken!,
        );
      }
      if (!mounted) return;
      setState(() {
        _authToken = newTokens.accessToken;
        _idToken = newTokens.idToken;
        _refreshToken = newTokens.refreshToken;
      });
      _showStatus(const ActionMessage.ok('Tokens refreshed'));
    } catch (e) {
      _showStatus(ActionMessage.failed('Refresh failed: ${_describe(e)}'));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  /// Revoke the session's tokens. The refresh token is the one that matters: it
  /// is the long-lived credential, and revoking it is what ends the grant.
  Future<void> _handleRevokeToken() async {
    if (_isLoading) return;
    if (_authToken == null && _refreshToken == null) {
      _showStatus(const ActionMessage.failed('No token to revoke'));
      return;
    }
    setState(() => _isLoading = true);
    try {
      await _revokeSessionTokens();
      if (!mounted) return;
      _clearSession();
      _showStatus(const ActionMessage.ok('Tokens revoked, signed out'));
    } catch (e) {
      _showStatus(ActionMessage.failed('Revoke failed: ${_describe(e)}'));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleVerifyToken() async {
    if (_isLoading) return;
    if (_idToken == null) {
      _showStatus(const ActionMessage.failed('No ID token to verify'));
      return;
    }
    setState(() => _isLoading = true);
    try {
      await KrdpassAuth.instance.verifyToken(idToken: _idToken!);
      _showStatus(const ActionMessage.ok('Token signature valid'));
    } catch (e) {
      _showStatus(ActionMessage.failed('Invalid: ${_describe(e)}'));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  /// Revoke the refresh token first, then the access token.
  ///
  /// Order matters: the refresh token is what lets a holder mint new access
  /// tokens, so it is the credential an attacker wants. Revoking only the access
  /// token, which is what a "logout" that clears local fields effectively does,
  /// leaves the grant alive on the server.
  Future<void> _revokeSessionTokens() async {
    final environment = KrdpassAuth.instance.config.environment.name;
    final targets = <(String, String)>[
      if (_refreshToken != null) (_refreshToken!, 'refresh_token'),
      if (_authToken != null) (_authToken!, 'access_token'),
    ];
    for (final (token, hint) in targets) {
      if (_useServerMode) {
        await AuthBackendService.revokeToken(
          token: token,
          environment: environment,
          tokenTypeHint: hint,
        );
      } else {
        await KrdpassAuth.instance.revokeToken(token: token);
      }
    }
  }

  void _clearSession() => setState(() {
    _isLoggedIn = false;
    _authToken = null;
    _idToken = null;
    _refreshToken = null;
    _error = null;
    _installUrl = null;
    _userInfo = null;
    _isLoadingUserInfo = false;
  });

  /// Sign out.
  ///
  /// Clearing the local fields is the visible half. The half that matters is
  /// revoking the refresh token, because a refresh token left alive keeps
  /// working long after the user believes they signed out.
  ///
  /// Neither the SDK nor the reference BFF exposes an RP-initiated end-session
  /// endpoint, so this is as far as a client can take it: the grant is revoked,
  /// but any access token already issued stays valid until it expires. If your
  /// deployment adds an end-session endpoint, call it here as well.
  Future<void> _handleLogout() async {
    final hadTokens = _authToken != null || _refreshToken != null;
    final revoke = hadTokens ? _revokeSessionTokens() : null;
    _clearSession();
    setState(() => _actionMessage = null);
    // Best effort: the local session is already gone and there is no screen left
    // to retry from, so never block sign-out on the network.
    await revoke?.catchError((Object _) {});
  }

  void _showStatus(ActionMessage message) {
    if (!mounted) return;
    setState(() => _actionMessage = message);
    Future.delayed(const Duration(seconds: 3), () {
      if (mounted && identical(_actionMessage, message)) {
        setState(() => _actionMessage = null);
      }
    });
  }

  Future<_AuthResult> _loginServerMode() async {
    final pkce = KrdpassAuth.instance.generatePkcePair();
    final state = KrdpassAuth.instance.generateState();
    final nonce = KrdpassAuth.instance.generateState();
    final scopes = [KrdpassScopes.openid, KrdpassScopes.profile];
    if (_includeCitizenScope) scopes.add(KrdpassScopes.citizenIdentity);
    if (_includeOfflineScope) scopes.add(KrdpassScopes.offlineAccess);

    final parResponse = await AuthBackendService.getRequestUri(
      codeChallenge: pkce.codeChallenge,
      state: state,
      nonce: nonce,
      environment: KrdpassAuth.instance.config.environment.name,
      redirectUri: Config.redirectUri,
      scope: scopes.join(' '),
    );

    // The auth window matches the request_uri lifetime (floored at 1s), same as the
    // Android/iOS/RN demos; the backend copies expires_in from CAS unvalidated.
    final authTimeoutSeconds = parResponse.expiresIn ?? 300;
    final result = await KrdpassAuth.instance.authenticate(
      requestUri: parResponse.requestUri,
      state: parResponse.state,
      timeout: Duration(
        seconds: authTimeoutSeconds < 1 ? 1 : authTimeoutSeconds,
      ),
    );

    if (!result.isSuccess) {
      // Map the result's typed flags onto the same exception hierarchy the
      // client-mode signIn() throws, so _handleSignIn handles one set of
      // outcomes whichever mode ran.
      if (result.isCancelled) throw const KrdpassCancelledException();
      if (result.isTimeout) throw const KrdpassTimeoutException();
      if (result.isBusy) throw const KrdpassBusyException();
      throw KrdpassAuthenticationException(
        result.errorMessage,
        code: result.error,
        installUrl: result.installUrl,
      );
    }

    final tokens = await AuthBackendService.exchangeToken(
      code: result.code!,
      state: parResponse.state ?? '',
      codeVerifier: pkce.codeVerifier,
    );

    return _AuthResult(tokens.accessToken, tokens.idToken, tokens.refreshToken);
  }

  Future<_AuthResult> _loginClientMode() async {
    final scopes = [KrdpassScopes.openid, KrdpassScopes.profile];
    if (_includeCitizenScope) scopes.add(KrdpassScopes.citizenIdentity);
    if (_includeOfflineScope) scopes.add(KrdpassScopes.offlineAccess);

    final tokens = await KrdpassAuth.instance.signIn(
      scopes: scopes,
      timeout: const Duration(minutes: 5),
    );
    return _AuthResult(tokens.accessToken, tokens.idToken, tokens.refreshToken);
  }
}
