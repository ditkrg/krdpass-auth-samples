import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:krdpass_auth_flutter/krdpass_auth_flutter.dart';

/// A backend failure with a clean message (no `Exception:` prefix) so it can be
/// displayed verbatim.
class BackendException implements Exception {
  BackendException(this.message);
  final String message;
  @override
  String toString() => message;
}

const _unreachable =
    "Can't reach the backend. Check your connection and that the server is running.";

class ParResponse {
  final String requestUri;
  final int? expiresIn;
  final String? state;

  ParResponse({required this.requestUri, this.expiresIn, this.state});
}

String _describeError(http.Response response) {
  try {
    final json = jsonDecode(response.body) as Map<String, dynamic>;
    final detail = json['error_description'] ?? json['error'];
    if (detail != null && '$detail'.isNotEmpty) {
      return '$detail (HTTP ${response.statusCode})';
    }
  } catch (_) {
    // Body was not JSON (e.g. an HTML 5xx page): fall through to a friendly label.
  }
  final code = response.statusCode;
  final friendly = code >= 500
      ? 'The backend is unavailable right now. Make sure the backend server is running and reachable.'
      : (code == 401 || code == 403)
      ? 'The backend rejected this request (not authorized).'
      : code == 404
      ? 'Backend endpoint not found. Check the backend URL.'
      : 'Request failed';
  return '$friendly (HTTP $code)';
}

/// Talks to your application's backend (the BFF), which is what holds the client
/// secret and talks to KRDPASS.
class AuthBackendService {
  AuthBackendService({required this.baseUrl});

  /// Injected rather than read from a global: the endpoints are derived from it, so
  /// pointing the demo at a different backend is a constructor argument, not an edit.
  final String baseUrl;

  /// POST JSON, mapping transport failures (server down / no network) to a
  /// canonical [BackendException] instead of leaking the raw socket error.
  Future<http.Response> _post(Uri url, Map<String, dynamic> body) async {
    try {
      return await http.post(
        url,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(body),
      );
    } on SocketException {
      throw BackendException(_unreachable);
    } on http.ClientException {
      throw BackendException(_unreachable);
    }
  }

  Future<ParResponse> getRequestUri({
    required String codeChallenge,
    String? state,
    String? nonce,
    required String environment,
    required String redirectUri,
    String? scope,
  }) async {
    final requestBody = {
      'codeChallenge': codeChallenge,
      'codeChallengeMethod': 'S256',
      'environment': environment,
      'redirectUri': redirectUri,
      'state': ?state,
      'nonce': ?nonce,
      'scope': ?scope,
    };

    final response = await _post(Uri.parse('$baseUrl/oauth/par'), requestBody);

    if (response.statusCode != 200) {
      throw BackendException(_describeError(response));
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    if (data['error'] != null) {
      // Covers a deployment that answers 200 with an OAuth error body; the
      // reference server always uses a non-200 status, caught above.
      final detail = data['error_description'] ?? data['error'];
      throw BackendException('PAR request failed: $detail');
    }

    // Fail here, not three lines later inside authenticate(''): a PAR response
    // without a requestUri is a broken backend, and an empty string only moves the
    // error somewhere that no longer names the cause.
    final requestUri = data['requestUri'];
    if (requestUri is! String || requestUri.trim().isEmpty) {
      throw BackendException(
        "The backend's PAR response contained no requestUri.",
      );
    }

    return ParResponse(
      requestUri: requestUri,
      expiresIn: data['expiresIn'] as int?,
      state: data['state'] as String?,
    );
  }

  Future<KrdpassTokenResult> exchangeToken({
    required String code,
    required String state,
    required String codeVerifier,
  }) async {
    final response = await _post(Uri.parse('$baseUrl/oauth/token'), {
      'code': code,
      'state': state,
      'codeVerifier': codeVerifier,
    });

    if (response.statusCode != 200) {
      throw BackendException(_describeError(response));
    }

    return _readTokenResult(response.body);
  }

  /// fromJson throws a FormatException, whose `toString()` the UI would show with its type
  /// prefix.
  KrdpassTokenResult _readTokenResult(String body) {
    final tokenData = jsonDecode(body) as Map<String, dynamic>;
    final accessToken = tokenData['accessToken'];
    if (accessToken is! String || accessToken.isEmpty) {
      throw BackendException('The backend returned no access token.');
    }
    return KrdpassTokenResult.fromJson(tokenData);
  }

  Future<KrdpassTokenResult> refreshToken({
    required String refreshToken,
    required String environment,
    String? scope,
  }) async {
    final body = {
      'refreshToken': refreshToken,
      'environment': environment,
      'scope': ?scope,
    };

    final response = await _post(Uri.parse('$baseUrl/oauth/token/refresh'), body);

    if (response.statusCode != 200) {
      throw BackendException(_describeError(response));
    }

    return _readTokenResult(response.body);
  }

  /// [tokenTypeHint] is required, with no default: a "sign out" has to revoke the refresh
  /// token, not just the access token, or the long-lived credential stays valid server-side.
  Future<void> revokeToken({
    required String token,
    required String environment,
    required String tokenTypeHint,
  }) async {
    final body = {
      'token': token,
      'environment': environment,
      'tokenTypeHint': tokenTypeHint,
    };

    final response = await _post(Uri.parse('$baseUrl/oauth/token/revoke'), body);

    if (response.statusCode != 200) {
      throw BackendException(_describeError(response));
    }
  }
}
