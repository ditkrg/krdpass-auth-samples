import 'package:flutter/material.dart';

// Private color definitions
class _KrdpassLightColors {
  static const primary = Color(0xFF00AAFF);
  static const background = Color(0xFFFFFFFF);
  static const surface = Color(0xFFF1FAFF);
  static const text = Color(0xFF1E1E1E);
  static const caption = Color(0xFF5F6368);
  static const success = Color(0xFF00CE2A);
  static const error = Color(0xFFFF001D);
  static const line = Color(0xFFCDD6DE);
  static const redHighlight = Color(0xFFFFEBED);
}

class _KrdpassDarkColors {
  static const primary = Color(0xFF00AAFF);
  static const background = Color(0xFF121212);
  static const surface = Color(0xFF1E1E1E);
  static const text = Color(0xFFFFFFFF);
  static const caption = Color(0xFFB8BDC4);
  static const success = Color(0xFF00CE2A);
  static const error = Color(0xFFFF001D);
  static const line = Color(0xFF38383A);
  static const redHighlight = Color(0xFF3C0E12);
}

// Spacing Constants
class KrdpassSpacing {
  static const extraTiny = 4.0;
  static const tiny = 8.0;
  static const small = 12.0;
  static const compact = 16.0;
  static const normal = 20.0;
  static const medium = 24.0;
  static const large = 28.0;
  static const extraLarge = 32.0;
  static const primaryButtonHeight = 52.0;
  static const appBarHeight = 64.0;
}

@immutable
class KrdpassThemeColors extends ThemeExtension<KrdpassThemeColors> {
  final Color success;
  final Color line;
  final Color caption;
  final Color redHighlight;
  final Color surfaceSubtle;

  const KrdpassThemeColors({
    required this.success,
    required this.line,
    required this.caption,
    required this.redHighlight,
    required this.surfaceSubtle,
  });

  @override
  KrdpassThemeColors copyWith({
    Color? success,
    Color? line,
    Color? caption,
    Color? redHighlight,
    Color? surfaceSubtle,
  }) {
    return KrdpassThemeColors(
      success: success ?? this.success,
      line: line ?? this.line,
      caption: caption ?? this.caption,
      redHighlight: redHighlight ?? this.redHighlight,
      surfaceSubtle: surfaceSubtle ?? this.surfaceSubtle,
    );
  }

  @override
  KrdpassThemeColors lerp(ThemeExtension<KrdpassThemeColors>? other, double t) {
    if (other is! KrdpassThemeColors) {
      return this;
    }
    return KrdpassThemeColors(
      success: Color.lerp(success, other.success, t)!,
      line: Color.lerp(line, other.line, t)!,
      caption: Color.lerp(caption, other.caption, t)!,
      redHighlight: Color.lerp(redHighlight, other.redHighlight, t)!,
      surfaceSubtle: Color.lerp(surfaceSubtle, other.surfaceSubtle, t)!,
    );
  }
}

// Extension for easy access in build context
extension KrdpassThemeContext on BuildContext {
  KrdpassThemeColors get krdpassColors =>
      Theme.of(this).extension<KrdpassThemeColors>()!;
}

ThemeData _buildTheme({
  required Color primary,
  required Color background,
  required Color surface,
  required Color text,
  required Color caption,
  required Color success,
  required Color error,
  required Color line,
  required Color redHighlight,
  required Brightness brightness,
}) {
  final colorScheme = ColorScheme(
    brightness: brightness,
    primary: primary,
    onPrimary: Colors.white,
    secondary: primary,
    onSecondary: Colors.white,
    error: error,
    onError: Colors.white,
    surface: background,
    onSurface: text,
    surfaceContainerHighest: surface,
    outline: line,
  );

  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    scaffoldBackgroundColor: background,
    colorScheme: colorScheme,
    extensions: [
      KrdpassThemeColors(
        success: success,
        line: line,
        caption: caption,
        redHighlight: redHighlight,
        surfaceSubtle: surface.withValues(
          alpha: brightness == Brightness.dark ? 1.0 : 0.5,
        ),
      ),
    ],
    appBarTheme: AppBarTheme(
      backgroundColor: background,
      centerTitle: true,
      surfaceTintColor: Colors.transparent,
      titleTextStyle: TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.w600,
        color: text,
      ),
      toolbarHeight: KrdpassSpacing.appBarHeight,
      elevation: 0,
      iconTheme: IconThemeData(color: text),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        foregroundColor: Colors.white,
        backgroundColor: primary,
        fixedSize: const Size(
          double.infinity,
          KrdpassSpacing.primaryButtonHeight,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: primary,
        side: BorderSide(color: primary),
        fixedSize: const Size(
          double.infinity,
          KrdpassSpacing.primaryButtonHeight,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
      ),
    ),
    cardTheme: CardThemeData(
      color: surface,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide(color: line),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide(color: line),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide(color: primary),
      ),
      hintStyle: TextStyle(color: caption),
      labelStyle: TextStyle(color: caption),
      floatingLabelStyle: TextStyle(color: primary),
    ),
    iconTheme: IconThemeData(color: text),
    textTheme: TextTheme(
      headlineLarge: TextStyle(
        fontSize: 22,
        fontWeight: FontWeight.w500,
        color: primary,
      ),
      titleMedium: TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w500,
        color: text,
      ),
      bodyLarge: TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w400,
        color: text,
      ),
      bodyMedium: TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w400,
        color: caption,
      ),
      labelLarge: const TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w500,
        color: Colors.white,
      ),
    ),
    dividerTheme: DividerThemeData(color: line, thickness: 1),
  );
}

final lightTheme = _buildTheme(
  primary: _KrdpassLightColors.primary,
  background: _KrdpassLightColors.background,
  surface: _KrdpassLightColors.surface,
  text: _KrdpassLightColors.text,
  caption: _KrdpassLightColors.caption,
  success: _KrdpassLightColors.success,
  error: _KrdpassLightColors.error,
  line: _KrdpassLightColors.line,
  redHighlight: _KrdpassLightColors.redHighlight,
  brightness: Brightness.light,
);

final darkTheme = _buildTheme(
  primary: _KrdpassDarkColors.primary,
  background: _KrdpassDarkColors.background,
  surface: _KrdpassDarkColors.surface,
  text: _KrdpassDarkColors.text,
  caption: _KrdpassDarkColors.caption,
  success: _KrdpassDarkColors.success,
  error: _KrdpassDarkColors.error,
  line: _KrdpassDarkColors.line,
  redHighlight: _KrdpassDarkColors.redHighlight,
  brightness: Brightness.dark,
);
