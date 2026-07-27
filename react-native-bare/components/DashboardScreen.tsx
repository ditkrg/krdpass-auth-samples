import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import type { KrdpassUserInfo } from 'krdpass-auth-react-native';
import React, { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemeColors, UI } from '../theme';
import {
  ActionButton,
  ActionMessage,
  ClaimSection,
  ExpandableCard,
} from './DemoUi';

interface DashboardScreenProps {
  claims: Record<string, unknown>;
  idClaims: Record<string, unknown>;
  accessClaims: Record<string, unknown>;
  userInfo?: KrdpassUserInfo;
  isLoadingUserInfo: boolean;
  isLoadingAction: boolean;
  actionMessage?: string;
  onFetchUserInfo: () => void;
  onLogout: () => void;
  onVerifyToken: () => void;
  onRefreshToken: () => void;
  onRevokeToken: () => void;
  theme: ThemeColors;
}

export function DashboardScreen({
  claims,
  idClaims,
  accessClaims,
  userInfo,
  isLoadingUserInfo,
  isLoadingAction,
  actionMessage,
  onFetchUserInfo,
  onLogout,
  onVerifyToken,
  onRefreshToken,
  onRevokeToken,
  theme,
}: DashboardScreenProps) {
  const styles = getStyles(theme);
  const [showUserInfo, setShowUserInfo] = useState(false);
  const [showTokens, setShowTokens] = useState(false);
  const [failedImageUrl, setFailedImageUrl] = useState<string>();

  const fullName =
    userInfo?.citizenFullName ||
    [
      claimText(claims.citizen_first),
      claimText(claims.citizen_second),
      claimText(claims.citizen_third),
      claimText(claims.citizen_surname),
    ]
      .filter(Boolean)
      .join(' ') ||
    claimText(claims.upn) ||
    'Citizen User';
  const firstName =
    userInfo?.citizenFirst || claimText(claims.citizen_first) || 'Citizen';
  const email =
    userInfo?.email ||
    claimText(claims.email) ||
    claimText(claims.upn) ||
    'No email';
  const birthdate = userInfo?.birthdate || claimText(claims.birthdate) || 'N/A';
  const gender =
    userInfo?.sexAtBirth || claimText(claims.sex_at_birth) || 'N/A';
  const profilePicture =
    userInfo?.picture ||
    userInfo?.citizenProfilePicture ||
    claimText(claims.citizen_profile_picture);

  return (
    <SafeAreaView
      edges={['top', 'right', 'bottom', 'left']}
      style={styles.root}
    >
      <View style={styles.appBar}>
        <View style={styles.headerCopy}>
          <Text style={styles.welcomeLabel}>Welcome,</Text>
          <Text style={styles.welcomeName}>{firstName}</Text>
        </View>
        <Pressable
          accessibilityLabel="Sign out"
          accessibilityRole="button"
          onPress={onLogout}
          style={({ pressed }) => [
            styles.logoutButton,
            pressed && styles.pressed,
          ]}
        >
          <MaterialIcons color={theme.error} name="exit-to-app" size={20} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.identityCard}>
          <View style={styles.identityRow}>
            <View style={styles.avatar}>
              {profilePicture && failedImageUrl !== profilePicture ? (
                <Image
                  onError={() => setFailedImageUrl(profilePicture)}
                  source={{ uri: profilePicture }}
                  style={styles.avatarImage}
                />
              ) : (
                <MaterialIcons color={theme.primary} name="person" size={32} />
              )}
            </View>
            <View style={styles.identityCopy}>
              <Text numberOfLines={2} style={styles.identityName}>
                {fullName}
              </Text>
              <Text numberOfLines={1} style={styles.identityEmail}>
                {email}
              </Text>
            </View>
          </View>
          <View style={styles.verifiedBadge}>
            <MaterialIcons
              color={theme.success}
              name="verified-user"
              size={16}
            />
            <Text style={styles.verifiedText}>Official Verified Citizen</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Personal Details</Text>
        <View style={styles.detailRow}>
          <DetailCard
            icon="date-range"
            label="Birth Date"
            theme={theme}
            value={birthdate}
          />
          <View style={styles.detailSpacer} />
          <DetailCard
            icon="account-circle"
            label="Gender"
            theme={theme}
            value={gender}
          />
        </View>

        <View style={styles.majorGap} />

        <ExpandableCard
          expanded={showUserInfo}
          icon="refresh"
          onToggle={() => setShowUserInfo(value => !value)}
          theme={theme}
          title="Remote User Info Protocol"
        >
          <Text style={styles.description}>
            Fetch the latest profile data directly from the OIDC UserInfo
            endpoint using your Access Token.
          </Text>
          <ActionButton
            icon="refresh"
            label={
              isLoadingUserInfo ? 'Syncing...' : 'Sync with Remote UserInfo'
            }
            loading={isLoadingUserInfo}
            onPress={onFetchUserInfo}
            theme={theme}
          />
          {userInfo ? (
            <View style={styles.userInfoResult}>
              <View style={styles.successBadge}>
                <MaterialIcons
                  color={theme.success}
                  name="check-circle"
                  size={18}
                />
                <Text style={styles.successText}>Successfully synced!</Text>
              </View>
              <ClaimSection
                claims={userInfo.raw}
                theme={theme}
                title="UserInfo Claims"
              />
            </View>
          ) : null}
        </ExpandableCard>

        <View style={styles.cardGap} />

        <ExpandableCard
          expanded={showTokens}
          icon="lock"
          onToggle={() => setShowTokens(value => !value)}
          theme={theme}
          title="Token Details"
        >
          <View style={styles.claimStack}>
            <ClaimSection
              claims={idClaims}
              theme={theme}
              title="ID Token Claims"
            />
            <ClaimSection
              claims={accessClaims}
              theme={theme}
              title="Access Token Claims"
            />
          </View>
        </ExpandableCard>

        <View style={styles.cardGap} />

        <View style={styles.managementCard}>
          <View style={styles.managementHeader}>
            <MaterialIcons color={theme.primary} name="settings" size={20} />
            <Text style={styles.managementTitle}>Token Management</Text>
          </View>
          <ActionMessage message={actionMessage} theme={theme} />
          <View style={styles.actionStack}>
            <ActionButton
              compact
              disabled={isLoadingAction}
              label="Verify Token Signature"
              onPress={onVerifyToken}
              theme={theme}
              tone="neutral"
            />
            <ActionButton
              compact
              disabled={isLoadingAction}
              label="Refresh Access Token"
              onPress={onRefreshToken}
              theme={theme}
              tone="success"
            />
            <ActionButton
              compact
              disabled={isLoadingAction}
              label="Revoke Token (Log Out)"
              onPress={onRevokeToken}
              theme={theme}
              tone="danger"
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailCard({
  icon,
  label,
  value,
  theme,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  value: string;
  theme: ThemeColors;
}) {
  const styles = getStyles(theme);

  return (
    <View style={styles.detailCard}>
      <View style={styles.detailLabelRow}>
        <MaterialIcons color={theme.primary} name={icon} size={16} />
        <Text style={styles.detailLabel}>{label}</Text>
      </View>
      <Text numberOfLines={1} style={styles.detailValue}>
        {value}
      </Text>
    </View>
  );
}

function claimText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

const getStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    root: {
      backgroundColor: theme.background,
      flex: 1,
    },
    appBar: {
      alignItems: 'center',
      flexDirection: 'row',
      paddingHorizontal: UI.spacing.xl,
      paddingVertical: UI.spacing.lg,
    },
    headerCopy: {
      flex: 1,
    },
    welcomeLabel: {
      color: theme.textCaption,
      fontSize: UI.type.body,
      fontWeight: '500',
      lineHeight: 20,
    },
    welcomeName: {
      color: theme.textPrimary,
      fontSize: UI.type.screenTitle,
      fontWeight: '900',
      lineHeight: 28,
    },
    logoutButton: {
      alignItems: 'center',
      backgroundColor: theme.errorContainer,
      borderRadius: UI.radius.control,
      height: UI.size.compactControl,
      justifyContent: 'center',
      width: UI.size.compactControl,
    },
    content: {
      paddingBottom: UI.spacing.xxl,
      paddingHorizontal: UI.spacing.xl,
    },
    identityCard: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: UI.radius.feature,
      borderWidth: 1,
      padding: UI.spacing.lg,
    },
    identityRow: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      marginBottom: 20,
    },
    avatar: {
      alignItems: 'center',
      backgroundColor: theme.primaryContainer,
      borderRadius: UI.size.avatar / 2,
      height: UI.size.avatar,
      justifyContent: 'center',
      overflow: 'hidden',
      width: UI.size.avatar,
    },
    avatarImage: {
      height: '100%',
      width: '100%',
    },
    identityCopy: {
      flex: 1,
      marginLeft: UI.spacing.lg,
    },
    identityName: {
      color: theme.textPrimary,
      fontSize: UI.type.cardTitle,
      fontWeight: '700',
      lineHeight: 22,
    },
    identityEmail: {
      color: theme.textCaption,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 2,
    },
    verifiedBadge: {
      alignItems: 'center',
      backgroundColor: theme.successContainer,
      borderColor: `${theme.success}33`,
      borderRadius: UI.radius.control,
      borderWidth: 1,
      flexDirection: 'row',
      justifyContent: 'center',
      paddingVertical: UI.spacing.sm,
    },
    verifiedText: {
      color: theme.success,
      fontSize: UI.type.caption,
      fontWeight: '600',
      lineHeight: 16,
      marginLeft: UI.spacing.sm,
    },
    sectionTitle: {
      color: theme.textPrimary,
      fontSize: UI.type.section,
      fontWeight: '700',
      lineHeight: 22,
      marginBottom: UI.spacing.lg,
      marginTop: UI.spacing.sm,
    },
    detailRow: {
      flexDirection: 'row',
    },
    detailSpacer: {
      width: UI.spacing.md,
    },
    detailCard: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: UI.radius.card,
      borderWidth: 1,
      flex: 1,
      padding: UI.spacing.lg,
    },
    detailLabelRow: {
      alignItems: 'center',
      flexDirection: 'row',
      marginBottom: UI.spacing.sm,
    },
    detailLabel: {
      color: theme.textCaption,
      fontSize: UI.type.caption,
      lineHeight: 16,
      marginLeft: UI.spacing.sm,
    },
    detailValue: {
      color: theme.textPrimary,
      fontSize: UI.type.body,
      fontWeight: '700',
      lineHeight: 20,
    },
    majorGap: {
      height: UI.spacing.xl,
    },
    cardGap: {
      height: UI.spacing.lg,
    },
    description: {
      color: theme.textCaption,
      fontSize: UI.type.caption,
      lineHeight: 18,
      marginBottom: UI.spacing.lg,
    },
    userInfoResult: {
      gap: UI.spacing.md,
      marginTop: UI.spacing.lg,
    },
    successBadge: {
      alignItems: 'center',
      backgroundColor: theme.successContainer,
      borderRadius: UI.radius.control,
      flexDirection: 'row',
      padding: UI.spacing.md,
    },
    successText: {
      color: theme.success,
      fontSize: UI.type.caption,
      fontWeight: '700',
      marginLeft: UI.spacing.sm,
    },
    claimStack: {
      gap: UI.spacing.md,
    },
    managementCard: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: UI.radius.card,
      borderWidth: 1,
      padding: UI.spacing.lg,
    },
    managementHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      marginBottom: UI.spacing.lg,
    },
    managementTitle: {
      color: theme.textPrimary,
      fontSize: UI.type.body,
      fontWeight: '700',
      lineHeight: 20,
      marginLeft: UI.spacing.md,
    },
    actionStack: {
      gap: UI.spacing.sm,
      marginTop: UI.spacing.lg,
    },
    pressed: {
      opacity: 0.72,
    },
  });
