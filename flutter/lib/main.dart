import 'package:demo_krdpass_auth/app.dart';
import 'package:demo_krdpass_auth/config.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:krdpass_auth_flutter/krdpass_auth_flutter.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // .env is declared as a Flutter asset, so a missing file fails the build before
  // any Dart runs. Config reports a present-but-incomplete file, using the same
  // wording as the other samples.
  await dotenv.load(fileName: '.env');

  // Debug builds only. debugPrint is NOT stripped from release builds, so an
  // unguarded logger ships the SDK's auth trace to logcat and the device console
  // on every install. The Android sample gates the same wiring on BuildConfig.DEBUG.
  if (kDebugMode) {
    KrdpassLogger.logFunction = (level, message, [error, stackTrace]) {
      final parts = <Object?>[message, error, stackTrace]
        ..removeWhere((part) => part == null);
      debugPrint('KRDPASS $level: ${parts.join(' | ')}');
    };
  }

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
