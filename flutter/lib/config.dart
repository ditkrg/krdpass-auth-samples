import 'package:flutter_dotenv/flutter_dotenv.dart';

class Config {
  /// The values shipped in env.example. They exist so the file has a shape to copy,
  /// never so the app can run against them.
  static const _placeholders = {
    'your-client-id',
    'https://your-backend.example.com',
    'https://your-backend.example.com/_krdpass/oauth/callback',
  };

  /// Fail on the first missing or still-placeholder key: what is missing, which file
  /// supplies it, and how to generate it.
  static String _requireEnv(String key) {
    final value = dotenv.env[key]?.trim() ?? '';
    if (value.isEmpty || _placeholders.contains(value)) {
      throw StateError(
        'KRDPASS demo config missing: $key. '
        'Copy flutter/env.example to flutter/.env and fill it in, '
        'or run ./scripts/sync-secrets.sh from the repository root.',
      );
    }
    return value;
  }

  static String get clientId => _requireEnv('CLIENT_ID');

  static String get redirectUri => _requireEnv('REDIRECT_URI');

  /// Required, with no default: defaulting to development would point a misconfigured
  /// release build at the development CAS instead of failing.
  static String get environment {
    final raw = _requireEnv('KRD_ENVIRONMENT').toLowerCase();
    if (raw != 'development' && raw != 'production') {
      throw StateError(
        'KRDPASS demo config invalid: KRD_ENVIRONMENT must be development or '
        "production, got '$raw'.",
      );
    }
    return raw;
  }

  static String get backendUrl => _requireEnv('BACKEND_URL');
}
