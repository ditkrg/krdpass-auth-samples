import 'package:demo_krdpass_auth/app.dart';
import 'package:demo_krdpass_auth/config.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:krdpass_auth_flutter/krdpass_auth_flutter.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  try {
    await dotenv.load(fileName: ".env");
  } catch (_) {
    // .env must exist because pubspec.yaml bundles it as an asset; env.example
    // supplies defaults for any values .env is missing.
    await dotenv.load(fileName: "env.example");
  }

  KrdpassLogger.logFunction = (level, message, [error, stackTrace]) {
    final parts = <Object?>[message, error, stackTrace]
      ..removeWhere((part) => part == null);
    debugPrint('KRDPASS $level: ${parts.join(' | ')}');
  };

  // Initialize the SDK once at startup. Environment is env-driven (development
  // by default) so this matches the Android/RN samples instead of being hardcoded.
  final config = KrdpassConfig(
    environment: Config.environment == 'production'
        ? KrdpassEnvironment.production
        : KrdpassEnvironment.development,
    clientId: Config.clientId,
    redirectUri: Config.redirectUri,
  );

  await KrdpassAuth.instance.initialize(config: config);

  runApp(const App());
}
