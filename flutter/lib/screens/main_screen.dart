import 'package:demo_krdpass_auth/auth_view_model.dart';
import 'package:demo_krdpass_auth/models/action_message.dart';
import 'package:demo_krdpass_auth/theme.dart';
import 'package:demo_krdpass_auth/widgets/landing_screen.dart';
import 'package:demo_krdpass_auth/widgets/logged_in_dashboard.dart';
import 'package:flutter/material.dart';

/// The demo's single screen: the landing form before sign-in, the dashboard after it.
class MainScreen extends StatelessWidget {
  const MainScreen({required this.viewModel, super.key});

  final AuthViewModel viewModel;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: ListenableBuilder(
            listenable: viewModel,
            builder: (context, _) {
              final message = viewModel.actionMessage;
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Above the landing/dashboard switch on purpose: "Tokens revoked,
                  // signed out" is reported by the action that removes the dashboard,
                  // so a line rendered inside it would never be seen.
                  if (message != null) _ActionMessageLine(message: message),
                  Expanded(
                    child: viewModel.isLoggedIn
                        ? LoggedInDashboard(viewModel: viewModel)
                        : LandingScreen(viewModel: viewModel),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

/// The transient result of a token-management action.
class _ActionMessageLine extends StatelessWidget {
  const _ActionMessageLine({required this.message});

  final ActionMessage message;

  @override
  Widget build(BuildContext context) {
    // The kind drives the icon and the colour; the text is only ever text.
    final tint = message.ok
        ? context.krdpassColors.caption
        : Theme.of(context).colorScheme.error;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Icon(
            message.ok
                ? Icons.info_outline_rounded
                : Icons.warning_amber_rounded,
            size: 14,
            color: tint,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message.text,
              style: TextStyle(fontSize: 12, color: tint),
            ),
          ),
        ],
      ),
    );
  }
}
