import 'package:demo_krdpass_auth/auth_view_model.dart';
import 'package:demo_krdpass_auth/theme.dart';
import 'package:demo_krdpass_auth/widgets/krdpass_logo.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

/// Pre-sign-in screen: scope and mode toggles, the sign-in button, and any sign-in
/// failure.
class LandingScreen extends StatelessWidget {
  const LandingScreen({required this.viewModel, super.key});

  final AuthViewModel viewModel;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return SingleChildScrollView(
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              mainAxisSize: MainAxisSize.max,
              children: [
                Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.primary,
                    shape: BoxShape.circle,
                  ),
                  child: const Center(
                    child: Icon(Icons.lock, color: Colors.white, size: 36),
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  'KRDPASS',
                  style: TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.w900,
                    color: Theme.of(context).colorScheme.onSurface,
                  ),
                ),
                Text(
                  'Digital Identity Demo',
                  style: TextStyle(
                    fontSize: 14,
                    color: context.krdpassColors.caption,
                  ),
                ),
                Text(
                  'Flutter on ${Theme.of(context).platform == TargetPlatform.iOS ? 'iOS' : 'Android'}',
                  style: TextStyle(
                    fontSize: 12,
                    color: context.krdpassColors.caption,
                  ),
                ),
                const SizedBox(height: 32),
                if (viewModel.error != null) _ErrorCard(viewModel: viewModel),

                Card(
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(24),
                    side: BorderSide(
                      color: context.krdpassColors.line
                          .withValues(alpha: 0.5),
                    ),
                  ),
                  color: Theme.of(context).cardTheme.color,
                  margin: EdgeInsets.zero,
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      children: [
                        _ToggleRow(
                          title: 'Citizen Data',
                          subtitle: 'Include citizen_identity scope',
                          value: viewModel.includeCitizenScope,
                          onChanged: (value) =>
                              viewModel.includeCitizenScope = value,
                        ),
                        const _ToggleDivider(),
                        _ToggleRow(
                          title: 'Offline Access',
                          subtitle:
                              'Include offline_access scope (Refresh Token)',
                          value: viewModel.includeOfflineScope,
                          onChanged: (value) =>
                              viewModel.includeOfflineScope = value,
                        ),
                        const _ToggleDivider(),
                        _ToggleRow(
                          title: 'Auth Mode',
                          subtitle: viewModel.useServerMode
                              ? 'Backend-mediated (Secure)'
                              : 'Direct (Client-only)',
                          subtitleColor: Theme.of(context).colorScheme.primary,
                          value: viewModel.useServerMode,
                          onChanged: (value) => viewModel.useServerMode = value,
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: FilledButton(
                    onPressed: viewModel.isSigningIn ? null : viewModel.signIn,
                    style: FilledButton.styleFrom(
                      backgroundColor: Theme.of(context).colorScheme.primary,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                    child: viewModel.isSigningIn
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              color: Colors.white,
                              strokeWidth: 2,
                            ),
                          )
                        : Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              KRDPASSLogo(size: 20),
                              const SizedBox(width: 12),
                              Text(
                                'Sign in with KRDPASS',
                                style: TextStyle(
                                  fontSize: 16,
                                  letterSpacing: 0.02 * 16,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _ToggleDivider extends StatelessWidget {
  const _ToggleDivider();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Divider(
        height: 1,
        thickness: 0.5,
        color: context.krdpassColors.line.withValues(alpha: 0.5),
      ),
    );
  }
}

class _ToggleRow extends StatelessWidget {
  const _ToggleRow({
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onChanged,
    this.subtitleColor,
  });

  final String title;
  final String subtitle;
  final Color? subtitleColor;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                  color: Theme.of(context).colorScheme.onSurface,
                ),
              ),
              Text(
                subtitle,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: subtitleColor == null
                      ? FontWeight.normal
                      : FontWeight.w500,
                  color:
                      subtitleColor ??
                      context.krdpassColors.caption,
                ),
              ),
            ],
          ),
        ),
        Transform.scale(
          scale: 0.8,
          child: Switch(
            value: value,
            onChanged: onChanged,
            activeThumbColor: Theme.of(context).colorScheme.primary,
          ),
        ),
      ],
    );
  }
}

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.viewModel});

  final AuthViewModel viewModel;

  @override
  Widget build(BuildContext context) {
    final installUrl = viewModel.installUrl;
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.error.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Icon chip: soft error tint so it reads as an accent.
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.error.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              Icons.warning,
              color: Theme.of(context).colorScheme.error,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Sign-in failed',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                    color: Theme.of(context).colorScheme.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxHeight: 140),
                  child: SingleChildScrollView(
                    child: Text(
                      viewModel.error!,
                      style: TextStyle(
                        color: Theme.of(
                          context,
                        ).colorScheme.onSurface.withValues(alpha: 0.8),
                        fontSize: 12,
                      ),
                      maxLines: null,
                    ),
                  ),
                ),
                // provider_not_installed is the only sign-in failure the user can
                // actually fix, and the SDK hands us the store URL that fixes it.
                // Offer it as an action instead of ending on an error message.
                if (installUrl != null) ...[
                  const SizedBox(height: 8),
                  FilledButton(
                    onPressed: () => launchUrl(
                      Uri.parse(installUrl),
                      mode: LaunchMode.externalApplication,
                    ),
                    style: FilledButton.styleFrom(
                      backgroundColor: Theme.of(context).colorScheme.error,
                      foregroundColor: Theme.of(context).colorScheme.onError,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                    child: const Text('Install KRDPASS'),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          IconButton(
            onPressed: viewModel.clearError,
            icon: Icon(
              Icons.close,
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.7),
              size: 18,
            ),
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(),
            iconSize: 18,
          ),
        ],
      ),
    );
  }
}
