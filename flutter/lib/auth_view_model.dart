import 'dart:async';

import 'package:demo_krdpass_auth/config.dart';
import 'package:demo_krdpass_auth/models/action_message.dart';
import 'package:demo_krdpass_auth/services/auth_backend_service.dart';
import 'package:flutter/foundation.dart';
import 'package:krdpass_auth_flutter/krdpass_auth_flutter.dart';

String _describe(Object e) => switch (e) {
  KrdpassException(:final message) => message,
  BackendException(:final message) => message,
  _ => e.toString(),
};

/// Owns the demo's auth session and SDK orchestration, off the widget tree, so the
/// views stay a function of this state and the session survives a rebuild.
class AuthViewModel extends ChangeNotifier {
  /// The backend is a dependency, not a global: same shape as the Android and iOS
  /// samples, and it is the seam a test would replace.
  final AuthBackendService _backend = AuthBackendService(
    baseUrl: Config.backendUrl,
  );

  KrdpassTokenResult? _tokens;
  KrdpassUserInfo? _userInfo;
  String? _error;
  String? _installUrl;
  ActionMessage? _actionMessage;
  Timer? _actionMessageTimer;

  bool _signingIn = false;
  bool _loadingUserInfo = false;
  bool _busy = false;

  bool _includeCitizenScope = true;
  bool _includeOfflineScope = true;
  bool _useServerMode = true;

  bool get isLoggedIn => _tokens != null;
  KrdpassTokenResult? get tokens => _tokens;
  KrdpassUserInfo? get userInfo => _userInfo;
  String? get error => _error;

  /// Store listing for the KRDPASS app, set only when sign-in failed with
  /// `provider_not_installed`. It is the one auth failure the user can fix, so the
  /// UI offers it as a link instead of leaving them at a dead end.
  String? get installUrl => _installUrl;
  ActionMessage? get actionMessage => _actionMessage;

  /// A sign-in is in flight.
  bool get isSigningIn => _signingIn;

  /// A UserInfo sync is in flight.
  bool get isLoadingUserInfo => _loadingUserInfo;

  /// A token-management action (verify / refresh / revoke) is in flight.
  bool get isBusy => _busy;

  bool get includeCitizenScope => _includeCitizenScope;
  bool get includeOfflineScope => _includeOfflineScope;
  bool get useServerMode => _useServerMode;

  set includeCitizenScope(bool value) {
    _includeCitizenScope = value;
    notifyListeners();
  }

  set includeOfflineScope(bool value) {
    _includeOfflineScope = value;
    notifyListeners();
  }

  set useServerMode(bool value) {
    _useServerMode = value;
    notifyListeners();
  }

  @override
  void dispose() {
    _actionMessageTimer?.cancel();
    super.dispose();
  }

  /// Sign in, handling each outcome on its own terms: a cancellation is not a
  /// failure, a timeout is retryable, and `provider_not_installed` carries the
  /// install URL that fixes it.
  Future<void> signIn() async {
    if (_signingIn) return;
    _signingIn = true;
    _error = null;
    _installUrl = null;
    notifyListeners();
    try {
      _tokens = _useServerMode
          ? await _signInWithServer()
          : await _signInDirect();
    } on KrdpassCancelledException {
      // The user backed out on purpose: drop the spinner, show no error.
    } on KrdpassTimeoutException {
      _error = 'KRDPASS did not respond in time. Try signing in again.';
    } on KrdpassBusyException {
      _error = 'A sign-in is already in progress. Finish or cancel it first.';
    } on KrdpassAuthenticationException catch (e) {
      // installUrl is non-null only for provider_not_installed. Passing it through is
      // what turns "something went wrong" into a working next step.
      _error = e.message;
      _installUrl = e.installUrl;
    } catch (e) {
      _error = _describe(e);
    } finally {
      _signingIn = false;
      notifyListeners();
    }
  }

  Future<KrdpassTokenResult> _signInWithServer() async {
    final pkce = KrdpassAuth.instance.generatePkcePair();
    final state = KrdpassAuth.instance.generateState();
    final nonce = KrdpassAuth.instance.generateState();

    final parResponse = await _backend.getRequestUri(
      codeChallenge: pkce.codeChallenge,
      state: state,
      nonce: nonce,
      environment: Config.environment,
      redirectUri: Config.redirectUri,
      scope: _scopes.join(' '),
    );

    // Don't wait past the request_uri the backend just minted; the backend copies
    // expires_in from CAS unvalidated, so floor it at 1s.
    final authTimeoutSeconds = parResponse.expiresIn ?? 300;
    final result = await KrdpassAuth.instance.authenticate(
      requestUri: parResponse.requestUri,
      state: parResponse.state,
      timeout: Duration(
        seconds: authTimeoutSeconds < 1 ? 1 : authTimeoutSeconds,
      ),
    );

    if (!result.isSuccess) {
      // Map onto the same exception hierarchy the direct signIn() throws, so
      // signIn() above handles one set of outcomes whichever mode ran.
      if (result.isCancelled) throw const KrdpassCancelledException();
      if (result.isTimeout) throw const KrdpassTimeoutException();
      if (result.isBusy) throw const KrdpassBusyException();
      throw KrdpassAuthenticationException(
        result.errorMessage,
        code: result.error,
        installUrl: result.installUrl,
      );
    }

    return _backend.exchangeToken(
      code: result.code!,
      // The backend echoes the state it bound to the request; fall back to the one we
      // generated rather than to '', which the server would reject.
      state: parResponse.state ?? state,
      codeVerifier: pkce.codeVerifier,
    );
  }

  Future<KrdpassTokenResult> _signInDirect() => KrdpassAuth.instance.signIn(
    scopes: _scopes,
    timeout: const Duration(minutes: 5),
  );

  List<String> get _scopes => [
    KrdpassScopes.openid,
    KrdpassScopes.profile,
    if (_includeCitizenScope) KrdpassScopes.citizenIdentity,
    if (_includeOfflineScope) KrdpassScopes.offlineAccess,
  ];

  Future<void> fetchUserInfo() async {
    if (_loadingUserInfo || _tokens == null) return;
    _loadingUserInfo = true;
    notifyListeners();
    try {
      // Goes through _validAccessToken() rather than tokens.accessToken, so
      // expiry is handled where the token is used.
      _userInfo = await KrdpassAuth.instance.getUserInfo(
        accessToken: await _validAccessToken(),
      );
      _showStatus(const ActionMessage.ok('User info synced'));
    } catch (e) {
      _showStatus(ActionMessage.failed('Sync failed: ${_describe(e)}'));
    } finally {
      _loadingUserInfo = false;
      notifyListeners();
    }
  }

  /// The access token to send with the next API call, refreshed first if it has
  /// expired. Expiry is handled here, where the token is used, not by a button
  /// the user has to remember to press; `isExpired` allows for clock skew.
  Future<String> _validAccessToken() async {
    final current = _tokens;
    if (current == null) throw StateError('Not signed in.');
    if (!current.isExpired()) return current.accessToken;
    final refreshToken = current.refreshToken;
    // No offline_access scope means there is nothing to refresh with: sign in again.
    if (refreshToken == null) {
      throw StateError('Session expired. Sign in again.');
    }
    final refreshed = await _refreshedTokens(current, refreshToken);
    _tokens = refreshed;
    return refreshed.accessToken;
  }

  /// Exchange a refresh token for a new token set, via the backend or the SDK.
  /// The scopes granted to the session are re-sent: an omitted `scope` leaves
  /// the decision to the server, which may silently narrow the grant.
  Future<KrdpassTokenResult> _refreshedTokens(
    KrdpassTokenResult current,
    String refreshToken,
  ) {
    if (_useServerMode) {
      return _backend.refreshToken(
        refreshToken: refreshToken,
        environment: Config.environment,
        scope: current.scope,
      );
    }
    return KrdpassAuth.instance.refreshTokens(
      refreshToken: refreshToken,
      scope: current.scope,
    );
  }

  /// Refresh on demand, so the demo can show the exchange happening. Real code
  /// should not need this button: [_validAccessToken] refreshes at the point of use.
  Future<void> refreshToken() async {
    if (_busy) return;
    final current = _tokens;
    final refreshToken = current?.refreshToken;
    if (current == null || refreshToken == null) {
      _showStatus(const ActionMessage.failed('No refresh token available'));
      return;
    }
    _busy = true;
    notifyListeners();
    try {
      _tokens = await _refreshedTokens(current, refreshToken);
      _showStatus(const ActionMessage.ok('Tokens refreshed'));
    } catch (e) {
      _showStatus(ActionMessage.failed('Refresh failed: ${_describe(e)}'));
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  /// Revoke the session's tokens. The refresh token is the one that matters: it is the
  /// long-lived credential, and revoking it is what ends the grant.
  Future<void> revokeToken() async {
    if (_busy) return;
    final current = _tokens;
    if (current == null) {
      _showStatus(const ActionMessage.failed('No token to revoke'));
      return;
    }
    _busy = true;
    notifyListeners();
    try {
      await _revokeSessionTokens(current, _useServerMode);
      _clearSession();
      _showStatus(const ActionMessage.ok('Tokens revoked, signed out'));
    } catch (e) {
      _showStatus(ActionMessage.failed('Revoke failed: ${_describe(e)}'));
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  Future<void> verifyToken() async {
    if (_busy) return;
    final idToken = _tokens?.idToken;
    if (idToken == null) {
      _showStatus(const ActionMessage.failed('No ID token to verify'));
      return;
    }
    _busy = true;
    notifyListeners();
    try {
      await KrdpassAuth.instance.verifyToken(idToken: idToken);
      _showStatus(const ActionMessage.ok('Token signature valid'));
    } catch (e) {
      _showStatus(ActionMessage.failed('Invalid: ${_describe(e)}'));
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  /// Revoke the refresh token first, then the access token. Order matters: the
  /// refresh token is what mints new access tokens, and revoking only the
  /// access token leaves the grant alive server-side.
  Future<void> _revokeSessionTokens(
    KrdpassTokenResult session,
    bool useServerMode,
  ) async {
    final targets = <(String, String)>[
      if (session.refreshToken != null) (session.refreshToken!, 'refresh_token'),
      if (session.accessToken.isNotEmpty) (session.accessToken, 'access_token'),
    ];
    for (final (token, hint) in targets) {
      if (useServerMode) {
        await _backend.revokeToken(
          token: token,
          environment: Config.environment,
          tokenTypeHint: hint,
        );
      } else {
        await KrdpassAuth.instance.revokeToken(
          token: token,
          tokenTypeHint: hint,
        );
      }
    }
  }

  /// Sign out. Clearing the local fields is the visible half; the half that
  /// matters is revoking the refresh token, which would otherwise keep working.
  /// There is no end-session endpoint here, so issued access tokens stay valid
  /// until they expire; if your deployment adds one, call it here as well.
  Future<void> logout() async {
    final session = _tokens;
    final useServerMode = _useServerMode;
    _clearSession();
    if (session == null) return;
    try {
      await _revokeSessionTokens(session, useServerMode);
    } catch (_) {
      // Best effort: the local session is already gone and there is no screen left to
      // retry from, so never block sign-out on the network.
    }
  }

  void clearError() {
    _error = null;
    _installUrl = null;
    notifyListeners();
  }

  void _clearSession() {
    _tokens = null;
    _userInfo = null;
    _error = null;
    _installUrl = null;
    _loadingUserInfo = false;
    _actionMessageTimer?.cancel();
    _actionMessage = null;
    notifyListeners();
  }

  /// Show a transient status line that clears itself after 3s. The timer is replaced on
  /// every message, so a newer one is never wiped early by an earlier call's timer.
  void _showStatus(ActionMessage message) {
    _actionMessage = message;
    _actionMessageTimer?.cancel();
    _actionMessageTimer = Timer(const Duration(seconds: 3), () {
      _actionMessage = null;
      notifyListeners();
    });
    notifyListeners();
  }
}
