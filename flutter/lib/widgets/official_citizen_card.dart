import 'package:demo_krdpass_auth/models/citizen_identity.dart';
import 'package:demo_krdpass_auth/theme.dart';
import 'package:flutter/material.dart';

class OfficialCitizenCard extends StatelessWidget {
  final CitizenIdentity identity;

  const OfficialCitizenCard({required this.identity, super.key});

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(24),
        side: BorderSide(
          color: context.krdpassColors.line.withValues(alpha: 0.5),
        ),
      ),
      color: Theme.of(context).cardTheme.color,
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Row(
              children: [
                _ProfileImage(url: identity.profilePicUrl),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        identity.fullName,
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: Theme.of(context).colorScheme.onSurface,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        identity.email,
                        style: TextStyle(
                          fontSize: 13,
                          color: context.krdpassColors.caption,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),

            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: context.krdpassColors.success
                    .withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: context.krdpassColors.success
                      .withValues(alpha: 0.2),
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.max,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.verified_user_rounded,
                    size: 16,
                    color: context.krdpassColors.success,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'Official Verified Citizen',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: context.krdpassColors.success,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProfileImage extends StatelessWidget {
  final String? url;

  const _ProfileImage({this.url});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 56,
      height: 56,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.1),
        shape: BoxShape.circle,
      ),
      clipBehavior: Clip.antiAlias,
      child: url != null && url!.isNotEmpty
          ? Image.network(
              url!,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => Center(
                child: Icon(
                  Icons.person,
                  color: Theme.of(context).colorScheme.primary,
                  size: 32,
                ),
              ),
            )
          : Center(
              child: Icon(
                Icons.person,
                color: Theme.of(context).colorScheme.primary,
                size: 32,
              ),
            ),
    );
  }
}
