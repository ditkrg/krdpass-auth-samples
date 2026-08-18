import 'package:demo_krdpass_auth/theme.dart';
import 'package:flutter/material.dart';

/// Verify / refresh / revoke. The transient result line lives in MainScreen: "Tokens
/// revoked, signed out" has to outlive this card, which disappears the moment the
/// revoke succeeds.
class TokenManagementCard extends StatelessWidget {
  const TokenManagementCard({
    required this.busy,
    required this.onVerifyToken,
    required this.onRefreshToken,
    required this.onRevokeToken,
    super.key,
  });

  final bool busy;
  final VoidCallback onVerifyToken;
  final VoidCallback onRefreshToken;
  final VoidCallback onRevokeToken;

  @override
  Widget build(BuildContext context) {
    final colors = context.krdpassColors;
    return Card(
      elevation: 0,
      color: Theme.of(context).cardTheme.color,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: colors.line.withValues(alpha: 0.5)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Row(
              children: [
                Icon(
                  Icons.settings_rounded,
                  size: 20,
                  color: Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(width: 12),
                Text(
                  'Token Management',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: Theme.of(context).colorScheme.onSurface,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _ActionButton(
                  label: 'Verify Token Signature',
                  color: Theme.of(context).colorScheme.primary,
                  onPressed: busy ? null : onVerifyToken,
                ),
                const SizedBox(height: 8),
                _ActionButton(
                  label: 'Refresh Access Token',
                  color: colors.success,
                  onPressed: busy ? null : onRefreshToken,
                ),
                const SizedBox(height: 8),
                _ActionButton(
                  label: 'Revoke Token (Log Out)',
                  color: Theme.of(context).colorScheme.error,
                  onPressed: busy ? null : onRevokeToken,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.label,
    required this.color,
    required this.onPressed,
  });

  final String label;
  final Color color;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: color.withValues(alpha: 0.1),
        foregroundColor: color,
        fixedSize: const Size(double.infinity, 44),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      child: Text(label),
    );
  }
}
