import 'dart:convert';
import 'dart:io';

import 'package:demo_krdpass_auth/config.dart';
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

  factory ParResponse.fromJson(Map<String, dynamic> json) {
    return ParResponse(
      requestUri: json['requestUri'] as String,
      expiresIn: json['expiresIn'] as int?,
      state: json['state'] as String?,
    );
  }
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

class AuthBackendService {
  /// POST JSON, mapping transport failures (server down / no network) to a
  /// canonical [BackendException] instead of leaking the raw socket error.
  static Future<http.Response> _post(Uri url, Map<String, dynamic> body) async {
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

  static String normalizeEnvironment(String environment) {
    final normalized = environment.trim().toLowerCase();
    if (normalized == 'production' || normalized == 'prod') return 'production';
    if (normalized == 'development' || normalized == 'dev') {
      return 'development';
    }
    throw ArgumentError.value(
      environment,
      'environment',
      'must be one of: production, development',
    );
  }

  static Future<ParResponse> getRequestUri({
    required String codeChallenge,
    String? state,
    String? nonce,
    required String environment,
    required String redirectUri,
    String? scope,
  }) async {
    final normalizedEnvironment = normalizeEnvironment(environment);
    final requestBody = {
      'codeChallenge': codeChallenge,
      'codeChallengeMethod': 'S256',
      'environment': normalizedEnvironment,
      'redirectUri': redirectUri,
      'state': ?state,
      'nonce': ?nonce,
      'scope': ?scope,
    };

    final response = await _post(Uri.parse(Config.parEndpoint), requestBody);

    if (response.statusCode != 200) {
      throw BackendException(_describeError(response));
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    if (data['error'] != null) {
      throw BackendException('PAR request failed: ${data['error']}');
    }

    final parResponse = ParResponse.fromJson(data);
    return parResponse;
  }

  static Future<KrdpassTokenResult> exchangeToken({
    required String code,
    required String state,
    required String codeVerifier,
    required String environment,
    required String redirectUri,
  }) async {
    final normalizedEnvironment = normalizeEnvironment(environment);
    final response = await _post(Uri.parse(Config.tokenEndpoint), {
      'code': code,
      'state': state,
      'codeVerifier': codeVerifier,
      'environment': normalizedEnvironment,
      'redirectUri': redirectUri,
    });

    if (response.statusCode != 200) {
      throw BackendException(_describeError(response));
    }

    final tokenData = jsonDecode(response.body) as Map<String, dynamic>;
    return KrdpassTokenResult.fromJson(tokenData);
  }

  static Future<KrdpassTokenResult> refreshToken({
    required String refreshToken,
    required String environment,
    String? scope,
  }) async {
    final normalizedEnvironment = normalizeEnvironment(environment);
    final body = {
      'refreshToken': refreshToken,
      'environment': normalizedEnvironment,
      'scope': ?scope,
    };

    final response = await _post(
      Uri.parse('${Config.backendUrl}/oauth/token/refresh'),
      body,
    );

    if (response.statusCode != 200) {
      throw BackendException(_describeError(response));
    }

    final tokenData = jsonDecode(response.body) as Map<String, dynamic>;
    return KrdpassTokenResult.fromJson(tokenData);
  }

  static Future<void> revokeToken({
    required String token,
    required String environment,
    String tokenTypeHint = 'access_token',
  }) async {
    final normalizedEnvironment = normalizeEnvironment(environment);
    final body = {
      'token': token,
      'environment': normalizedEnvironment,
      'tokenTypeHint': tokenTypeHint,
    };

    final response = await _post(
      Uri.parse('${Config.backendUrl}/oauth/token/revoke'),
      body,
    );

    if (response.statusCode != 200) {
      throw BackendException(_describeError(response));
    }
  }
}
