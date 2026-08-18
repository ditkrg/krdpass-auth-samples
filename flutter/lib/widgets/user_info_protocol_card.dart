import 'package:demo_krdpass_auth/theme.dart';
import 'package:demo_krdpass_auth/widgets/claim_section.dart';
import 'package:flutter/material.dart';
import 'package:krdpass_auth_flutter/krdpass_auth_flutter.dart';

/// Fetches the OIDC UserInfo endpoint on demand and shows what came back.
class UserInfoProtocolCard extends StatelessWidget {
  const UserInfoProtocolCard({
    required this.isLoading,
    required this.onFetchUserInfo,
    this.userInfo,
    super.key,
  });

  final bool isLoading;
  final VoidCallback onFetchUserInfo;
  final KrdpassUserInfo? userInfo;

  @override
  Widget build(BuildContext context) {
    return ExpandableCard(
      title: 'Remote User Info Protocol',
      icon: Icons.sync_rounded,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: Text(
            'Fetch the latest profile data directly from the OIDC UserInfo endpoint using your Access Token.',
            style: TextStyle(
              fontSize: 13,
              color: Theme.of(context).colorScheme.onSurface.withAlpha(150),
            ),
          ),
        ),

        SizedBox(
          width: double.infinity,
          height: 52,
          child: FilledButton.icon(
            onPressed: isLoading ? null : onFetchUserInfo,
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.primary,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            icon: isLoading
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      color: Colors.white,
                      strokeWidth: 2.5,
                    ),
                  )
                : const Icon(Icons.sync_rounded, size: 20),
            label: Text(
              isLoading ? 'Syncing...' : 'Sync with Remote UserInfo',
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),

        if (userInfo != null) ...[
          const SizedBox(height: 16),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: context.krdpassColors.success.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.check_circle_rounded,
                  color: context.krdpassColors.success,
                  size: 20,
                ),
                const SizedBox(width: 8),
                Text(
                  'Successfully synced!',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: context.krdpassColors.success,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          ClaimSection(title: 'UserInfo Claims', data: userInfo!.raw),
        ],
      ],
    );
  }
}
