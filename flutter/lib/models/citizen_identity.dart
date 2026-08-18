import 'package:krdpass_auth_flutter/krdpass_auth_flutter.dart';

/// The identity the dashboard renders. Nothing more: a field nobody shows is a field
/// nobody keeps in sync.
class CitizenIdentity {
  final String firstName;
  final String fullName;
  final String email;
  final String? birthdate;
  final String? sex;
  final String? profilePicUrl;

  const CitizenIdentity({
    required this.firstName,
    required this.fullName,
    required this.email,
    this.birthdate,
    this.sex,
    this.profilePicUrl,
  });

  /// [userInfo]'s typed accessors come first: the UserInfo response is the
  /// fresher, SDK-normalised source. The ID token's raw claims ([idClaims]) are
  /// the fallback, for before a sync and for the claims UserInfo does not type.
  factory CitizenIdentity.fromSession({
    required Map<String, dynamic> idClaims,
    required KrdpassUserInfo? userInfo,
  }) {
    final raw = userInfo?.raw ?? idClaims;

    String? claim(String key) {
      final value = raw[key] ?? idClaims[key];
      return value is String && value.trim().isNotEmpty ? value : null;
    }

    final upn = userInfo?.upn ?? claim('upn');

    // The SDK already joins the four name parts (and drops the blank ones), so use its
    // accessor; the hand join below only covers the pre-sync raw claims.
    final rawParts = [
      claim('citizen_first'),
      claim('citizen_second'),
      claim('citizen_third'),
      claim('citizen_surname'),
    ].whereType<String>().join(' ');

    return CitizenIdentity(
      firstName: userInfo?.citizenFirst ?? claim('citizen_first') ?? '',
      fullName:
          userInfo?.citizenFullName ??
          (rawParts.isNotEmpty ? rawParts : (userInfo?.name ?? upn ?? 'Citizen User')),
      email: userInfo?.email ?? claim('email') ?? upn ?? 'No email',
      birthdate: userInfo?.birthdate ?? claim('birthdate'),
      sex: userInfo?.sexAtBirth ?? claim('sex_at_birth'),
      profilePicUrl: userInfo?.picture ?? claim('citizen_profile_picture'),
    );
  }
}
