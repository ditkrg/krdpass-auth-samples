import 'package:demo_krdpass_auth/models/citizen_identity.dart';
import 'package:demo_krdpass_auth/theme.dart';
import 'package:demo_krdpass_auth/widgets/personal_details_section.dart';
import 'package:demo_krdpass_auth/widgets/developer_console.dart';
import 'package:demo_krdpass_auth/widgets/official_citizen_card.dart';
import 'package:demo_krdpass_auth/models/action_message.dart';
import 'package:flutter/material.dart';
import 'package:krdpass_auth_flutter/krdpass_auth_flutter.dart';

class AuthenticatedView extends StatefulWidget {
  final String? authToken;
  final String? idToken;
  final KrdpassUserInfo? userInfo;
  final bool isLoadingUserInfo;
  final VoidCallback onFetchUserInfo;
  final VoidCallback onLogout;
  final VoidCallback onVerifyToken;
  final VoidCallback onRefreshToken;
  final VoidCallback onRevokeToken;
  final ActionMessage? actionMessage;

  const AuthenticatedView({
    this.authToken,
    this.idToken,
    this.userInfo,
    required this.isLoadingUserInfo,
    required this.onFetchUserInfo,
    required this.onLogout,
    required this.onVerifyToken,
    required this.onRefreshToken,
    required this.onRevokeToken,
    this.actionMessage,
    super.key,
  });

  @override
  State<AuthenticatedView> createState() => _AuthenticatedViewState();
}

class _AuthenticatedViewState extends State<AuthenticatedView> {
  late CitizenIdentity _identity;
  late Map<String, dynamic> _idClaims;
  late Map<String, dynamic> _accessClaims;

  @override
  void initState() {
    super.initState();
    _parseIdentity();
  }

  @override
  void didUpdateWidget(covariant AuthenticatedView oldWidget) {
    if (oldWidget.idToken != widget.idToken ||
        oldWidget.authToken != widget.authToken ||
        oldWidget.userInfo != widget.userInfo) {
      _parseIdentity();
    }
    super.didUpdateWidget(oldWidget);
  }

  void _parseIdentity() {
    _identity = CitizenIdentity.fromTokens(
      idToken: widget.idToken,
      userInfo: widget.userInfo?.raw,
    );

    _idClaims = widget.idToken != null
        ? _decodeUnverified(widget.idToken!)
        : {};
    _accessClaims = widget.authToken != null
        ? _decodeUnverified(widget.authToken!)
        : {};
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Pinned header, outside the scroll view.
        Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Welcome,',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: Theme.of(
                          context,
                        ).extension<KrdpassThemeColors>()!.caption,
                      ),
                    ),
                    Text(
                      _identity.firstName.isNotEmpty
                          ? _identity.firstName
                          : 'Citizen',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w900,
                        color: Theme.of(context).textTheme.headlineLarge?.color,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: widget.onLogout,
                style: IconButton.styleFrom(
                  backgroundColor: Theme.of(
                    context,
                  ).colorScheme.error.withValues(alpha: 0.1),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                icon: Icon(
                  Icons.logout_rounded,
                  color: Theme.of(context).colorScheme.error,
                  size: 20,
                ),
              ),
            ],
          ),
        ),

        // Scrollable Content
        Expanded(
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Identity Profile Header
                OfficialCitizenCard(identity: _identity),

                const SizedBox(height: 8),

                // Personal Details Grid
                PersonalDetailsSection(identity: _identity),

                const SizedBox(height: 24),

                // User Info Protocol (Sync)
                DeveloperConsole(
                  isLoading: widget.isLoadingUserInfo,
                  onFetchUserInfo: widget.onFetchUserInfo,
                  idClaims: _idClaims,
                  accessClaims: _accessClaims,
                  userInfo: widget.userInfo,
                ),

                const SizedBox(height: 16),

                // Token management actions.
                TokenManagementCard(
                  onVerifyToken: widget.onVerifyToken,
                  onRefreshToken: widget.onRefreshToken,
                  onRevokeToken: widget.onRevokeToken,
                  actionMessage: widget.actionMessage,
                ),

                const SizedBox(height: 32),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class TokenManagementCard extends StatelessWidget {
  final VoidCallback onVerifyToken;
  final VoidCallback onRefreshToken;
  final VoidCallback onRevokeToken;
  final ActionMessage? actionMessage;

  const TokenManagementCard({
    required this.onVerifyToken,
    required this.onRefreshToken,
    required this.onRevokeToken,
    this.actionMessage,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<KrdpassThemeColors>()!;
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
            if (actionMessage != null) ...[
              const SizedBox(height: 12),
              // The kind drives the icon and the colour; the text is only text.
              Builder(
                builder: (context) {
                  final message = actionMessage!;
                  final tint = message.ok
                      ? Theme.of(context).extension<KrdpassThemeColors>()!.caption
                      : Theme.of(context).colorScheme.error;
                  return Row(
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
                  );
                },
              ),
            ],
            const SizedBox(height: 16),
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                FilledButton(
                  onPressed: onVerifyToken,
                  style: FilledButton.styleFrom(
                    backgroundColor: Theme.of(
                      context,
                    ).colorScheme.primary.withValues(alpha: 0.1),
                    foregroundColor: Theme.of(context).colorScheme.primary,
                    fixedSize: const Size(double.infinity, 44),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: const Text('Verify Token Signature'),
                ),
                const SizedBox(height: 8),
                FilledButton(
                  onPressed: onRefreshToken,
                  style: FilledButton.styleFrom(
                    backgroundColor: Theme.of(context)
                        .extension<KrdpassThemeColors>()!
                        .success
                        .withValues(alpha: 0.1),
                    foregroundColor: Theme.of(
                      context,
                    ).extension<KrdpassThemeColors>()!.success,
                    fixedSize: const Size(double.infinity, 44),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: const Text('Refresh Access Token'),
                ),
                const SizedBox(height: 8),
                FilledButton(
                  onPressed: onRevokeToken,
                  style: FilledButton.styleFrom(
                    backgroundColor: Theme.of(
                      context,
                    ).colorScheme.error.withValues(alpha: 0.1),
                    foregroundColor: Theme.of(context).colorScheme.error,
                    fixedSize: const Size(double.infinity, 44),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: const Text('Revoke Token (Log Out)'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Decode a JWT payload for display, via the SDK's unverified decoder.
/// Returns an empty map if [token] isn't a parseable JWT.
Map<String, dynamic> _decodeUnverified(String token) {
  try {
    return KrdpassAuth.instance.decodeTokenUnverified(token);
  } on FormatException {
    return {};
  }
}
