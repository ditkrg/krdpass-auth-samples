import 'package:demo_krdpass_auth/auth_view_model.dart';
import 'package:demo_krdpass_auth/models/citizen_identity.dart';
import 'package:demo_krdpass_auth/theme.dart';
import 'package:demo_krdpass_auth/widgets/official_citizen_card.dart';
import 'package:demo_krdpass_auth/widgets/personal_details_section.dart';
import 'package:demo_krdpass_auth/widgets/token_details_card.dart';
import 'package:demo_krdpass_auth/widgets/token_management_card.dart';
import 'package:demo_krdpass_auth/widgets/user_info_protocol_card.dart';
import 'package:flutter/material.dart';
import 'package:krdpass_auth_flutter/krdpass_auth_flutter.dart';

/// Post-sign-in screen: the citizen's identity, then the developer-facing cards.
class LoggedInDashboard extends StatelessWidget {
  const LoggedInDashboard({required this.viewModel, super.key});

  final AuthViewModel viewModel;

  @override
  Widget build(BuildContext context) {
    final tokens = viewModel.tokens!;
    // Decoded once here and handed to both readers: the identity and the claim dump are
    // the same ID token, and decoding it twice per rebuild is work nobody asked for.
    final idClaims = _decodeUnverified(tokens.idToken);
    final identity = CitizenIdentity.fromSession(
      idClaims: idClaims,
      userInfo: viewModel.userInfo,
    );
    final accessClaims = _decodeUnverified(tokens.accessToken);

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
                        color: context.krdpassColors.caption,
                      ),
                    ),
                    Text(
                      identity.firstName.isNotEmpty
                          ? identity.firstName
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
                onPressed: viewModel.logout,
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

        Expanded(
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                OfficialCitizenCard(identity: identity),
                const SizedBox(height: 8),
                PersonalDetailsSection(identity: identity),
                const SizedBox(height: 24),
                UserInfoProtocolCard(
                  isLoading: viewModel.isLoadingUserInfo,
                  onFetchUserInfo: viewModel.fetchUserInfo,
                  userInfo: viewModel.userInfo,
                ),
                const SizedBox(height: 16),
                TokenDetailsCard(
                  idClaims: idClaims,
                  accessClaims: accessClaims,
                ),
                const SizedBox(height: 16),
                TokenManagementCard(
                  busy: viewModel.isBusy,
                  onVerifyToken: viewModel.verifyToken,
                  onRefreshToken: viewModel.refreshToken,
                  onRevokeToken: viewModel.revokeToken,
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

/// Decode a JWT payload for display, via the SDK's unverified decoder.
/// Returns an empty map if [token] isn't a parseable JWT (access tokens are often
/// opaque).
Map<String, dynamic> _decodeUnverified(String? token) {
  if (token == null) return {};
  try {
    return KrdpassAuth.instance.decodeTokenUnverified(token);
  } on FormatException {
    return {};
  }
}
