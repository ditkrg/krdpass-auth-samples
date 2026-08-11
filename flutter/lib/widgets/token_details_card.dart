import 'package:demo_krdpass_auth/widgets/claim_section.dart';
import 'package:flutter/material.dart';

/// The decoded (unverified) claims of the session's ID and access tokens.
class TokenDetailsCard extends StatelessWidget {
  const TokenDetailsCard({
    required this.idClaims,
    required this.accessClaims,
    super.key,
  });

  final Map<String, dynamic> idClaims;
  final Map<String, dynamic> accessClaims;

  @override
  Widget build(BuildContext context) {
    return ExpandableCard(
      title: 'Token Details',
      icon: Icons.vpn_key_rounded,
      children: [
        ClaimSection(title: 'ID Token Claims', data: idClaims),
        const SizedBox(height: 12),
        ClaimSection(title: 'Access Token Claims', data: accessClaims),
      ],
    );
  }
}
