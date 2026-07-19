import 'package:demo_krdpass_auth/models/citizen_identity.dart';
import 'package:demo_krdpass_auth/theme.dart';
import 'package:flutter/material.dart';

class PersonalDetailsSection extends StatelessWidget {
  final CitizenIdentity identity;

  const PersonalDetailsSection({required this.identity, super.key});

  @override
  Widget build(BuildContext context) {
    if (identity.birthdate == null && identity.sex == null) {
      return const SizedBox.shrink();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Personal Details',
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.bold,
            color: Theme.of(context).colorScheme.onSurface,
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            if (identity.birthdate != null)
              Expanded(
                child: _DetailCard(
                  icon: Icons.cake_outlined,
                  label: 'Birth Date',
                  value: identity.birthdate!,
                ),
              ),
            if (identity.birthdate != null && identity.sex != null)
              const SizedBox(width: 12),
            if (identity.sex != null)
              Expanded(
                child: _DetailCard(
                  icon: Icons.person_outline,
                  label: 'Gender',
                  value: identity.sex!.toUpperCase(),
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
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Theme.of(
          context,
        ).extension<KrdpassThemeColors>()!.surfaceSubtle.withValues(alpha: 0.5),
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
          Icon(icon, size: 20, color: Theme.of(context).colorScheme.primary),
          const SizedBox(height: 12),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: Theme.of(context).extension<KrdpassThemeColors>()!.caption,
            ),
          ),
          const SizedBox(height: 4),
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
