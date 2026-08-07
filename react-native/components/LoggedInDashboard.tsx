import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ThemeColors } from '../theme/colors';
import { IdentityCard } from './IdentityCard';
import { PersonalDetailCard } from './PersonalDetailCard';
import { UserInfoProtocolCard } from './UserInfoProtocolCard';
import { TokenDetailsCard } from './TokenDetailsCard';
import { TokenManagementCard } from './TokenManagementCard';
import type { ActionMessage } from './TokenManagementCard';
import { UI } from '../theme/metrics';

interface LoggedInDashboardProps {
  claims: Record<string, any>;
  idClaims: Record<string, any>;
  accessClaims: Record<string, any>;
  userInfo: any;
  isLoadingUserInfo: boolean;
  isLoadingAction: boolean;
  onFetchUserInfo: () => void;
  onLogout: () => void;
  onVerifyToken: () => void;
  onRefreshToken: () => void;
  onRevokeToken: () => void;
  theme: ThemeColors;
  actionMessage?: ActionMessage | null;
}

export const LoggedInDashboard: React.FC<LoggedInDashboardProps> = ({
  claims,
  idClaims,
  accessClaims,
  userInfo,
  isLoadingUserInfo,
  isLoadingAction,
  onFetchUserInfo,
  onLogout,
  onVerifyToken,
  onRefreshToken,
  onRevokeToken,
  theme,
  actionMessage,
}) => {
  const styles = useMemo(() => getStyles(theme), [theme]);

  // Identity resolution (matching Android logic)
  const fullName =
    userInfo?.citizenFullName ||
    [
      claims['citizen_first'],
      claims['citizen_second'],
      claims['citizen_third'],
      claims['citizen_surname'],
    ]
      .filter(Boolean)
      .join(' ') ||
    claims['upn'] ||
    'Citizen User';

  const citizenFirst =
    userInfo?.citizenFirst || claims['citizen_first'] || 'Citizen';
  const email =
    userInfo?.email || claims['email'] || claims['upn'] || 'No email';
  const birthdate = userInfo?.birthdate || claims['birthdate'];
  const sex = userInfo?.sexAtBirth || claims['sex_at_birth'];
  const profilePicUrl =
    userInfo?.picture ||
    claims['citizen_profile_picture'] ||
    idClaims['citizen_profile_picture'];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.appBar}>
        <View style={styles.headerCopy}>
          <Text style={styles.welcomeLabel}>Welcome,</Text>
          <Text style={styles.welcomeName}>{citizenFirst}</Text>
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
          <MaterialIcons name="exit-to-app" size={20} color={theme.error} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <IdentityCard
          fullName={fullName}
          email={email}
          profilePicUrl={profilePicUrl}
          theme={theme}
        />

        <Text style={styles.sectionHeader}>Personal Details</Text>
        <View style={styles.detailsRow}>
          <PersonalDetailCard
            icon="date-range"
            label="Birth Date"
            value={birthdate || 'N/A'}
            theme={theme}
          />
          <View style={styles.detailSpacer} />
          <PersonalDetailCard
            icon="account-circle"
            label="Gender"
            value={sex || 'N/A'}
            theme={theme}
          />
        </View>

        <View style={styles.majorGap} />

        <UserInfoProtocolCard
          isLoading={isLoadingUserInfo}
          userInfo={userInfo}
          onFetchUserInfo={onFetchUserInfo}
          theme={theme}
        />

        <View style={styles.cardGap} />

        <TokenDetailsCard
          idClaims={idClaims}
          accessClaims={accessClaims}
          theme={theme}
        />

        <View style={styles.cardGap} />

        <TokenManagementCard
          disabled={isLoadingAction}
          onVerifyToken={onVerifyToken}
          onRefreshToken={onRefreshToken}
          onRevokeToken={onRevokeToken}
          theme={theme}
          actionMessage={actionMessage}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const getStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    appBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: UI.spacing.xl,
      paddingVertical: UI.spacing.lg,
    },
    headerCopy: {
      flex: 1,
    },
    welcomeLabel: {
      fontSize: UI.type.body,
      fontWeight: '500',
      color: theme.textCaption,
      lineHeight: 20,
    },
    welcomeName: {
      fontSize: UI.type.screenTitle,
      fontWeight: '900',
      color: theme.textPrimary,
      lineHeight: 28,
    },
    logoutButton: {
      width: UI.size.compactControl,
      height: UI.size.compactControl,
      borderRadius: UI.radius.control,
      backgroundColor: theme.errorContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      paddingHorizontal: UI.spacing.xl,
      paddingBottom: UI.spacing.xxl,
    },
    sectionHeader: {
      fontSize: UI.type.section,
      fontWeight: 'bold',
      lineHeight: 22,
      marginBottom: UI.spacing.lg,
      marginTop: UI.spacing.sm,
      color: theme.textPrimary,
    },
    detailsRow: {
      flexDirection: 'row',
    },
    detailSpacer: {
      width: UI.spacing.md,
    },
    majorGap: {
      height: UI.spacing.xl,
    },
    cardGap: {
      height: UI.spacing.lg,
    },
    pressed: {
      opacity: 0.72,
    },
  });
