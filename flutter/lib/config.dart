import 'package:flutter_dotenv/flutter_dotenv.dart';

class Config {
  /// Fail on the first missing key, with the same wording every sample in this
  /// repo uses: what is missing, which file supplies it, and how to generate it.
  /// A demo that starts against half a config and dies later on a DNS error
  /// teaches nothing.
  static String _requireEnv(String key) {
    final value = dotenv.env[key];
    if (value == null || value.isEmpty) {
      throw StateError(
        'KRDPASS demo config missing: $key. '
        'Copy flutter/env.example to flutter/.env and fill it in, '
        'or run ./scripts/sync-secrets.sh from the repository root.',
      );
    }
    return value;
  }

  // Required configuration from .env
  static String get clientId => _requireEnv('CLIENT_ID');

  static String get redirectUri => _requireEnv('REDIRECT_URI');

  /// Target environment: 'development' (default) or 'production'.
  /// Mirrors the Android sample (BuildConfig.ENVIRONMENT) and the RN sample
  /// (EXPO_PUBLIC_KRD_ENVIRONMENT) so all three select the env the same way.
  static String get environment => dotenv.env['ENVIRONMENT'] ?? 'development';

  static String get backendUrl => _requireEnv('BACKEND_URL');

  static String get parEndpoint => '$backendUrl/oauth/par';
  static String get tokenEndpoint => '$backendUrl/oauth/token';
}
