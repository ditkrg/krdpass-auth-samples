import 'package:demo_krdpass_auth/auth_view_model.dart';
import 'package:demo_krdpass_auth/screens/main_screen.dart';
import 'package:demo_krdpass_auth/theme.dart';
import 'package:flutter/material.dart';

class App extends StatefulWidget {
  const App({super.key});

  @override
  State<App> createState() => _AppState();
}

class _AppState extends State<App> {
  // Owned above the screen so the session outlives a rebuild of the widget below it.
  final _viewModel = AuthViewModel();

  @override
  void dispose() {
    _viewModel.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'KRDPASS Demo - Sign in with KRDPASS',
      theme: lightTheme,
      darkTheme: darkTheme,
      themeMode: ThemeMode.system,
      home: MainScreen(viewModel: _viewModel),
    );
  }
}
