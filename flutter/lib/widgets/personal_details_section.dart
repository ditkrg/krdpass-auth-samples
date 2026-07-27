import 'package:demo_krdpass_auth/models/citizen_identity.dart';
import 'package:demo_krdpass_auth/theme.dart';
import 'package:flutter/material.dart';

class PersonalDetailsSection extends StatelessWidget {
  final CitizenIdentity identity;

  const PersonalDetailsSection({required this.identity, super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Personal Details',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: Theme.of(context).colorScheme.onSurface,
          ),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: _DetailCard(
                icon: Icons.cake_outlined,
                label: 'Birth Date',
                value: identity.birthdate ?? 'N/A',
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _DetailCard(
                icon: Icons.person_outline,
                label: 'Gender',
                value: identity.sex?.toUpperCase() ?? 'N/A',
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _DetailCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _DetailCard({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).cardTheme.color,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: Theme.of(
            context,
          ).extension<KrdpassThemeColors>()!.line.withValues(alpha: 0.5),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                icon,
                size: 16,
                color: Theme.of(context).colorScheme.primary,
              ),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  color: Theme.of(
                    context,
                  ).extension<KrdpassThemeColors>()!.caption,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: Theme.of(context).colorScheme.onSurface,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}
