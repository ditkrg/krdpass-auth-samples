import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ThemeColors } from '../theme/colors';
import { UI } from '../theme/metrics';
import { DemoButton } from './DemoButton';
import { ExpandableCard } from './ExpandableCard';

interface UserInfoProtocolCardProps {
  isLoading: boolean;
  userInfo?: { raw?: Record<string, unknown> } | null;
  onFetchUserInfo: () => void;
  theme: ThemeColors;
}

export const UserInfoProtocolCard: React.FC<UserInfoProtocolCardProps> = ({
  isLoading,
  userInfo,
  onFetchUserInfo,
  theme,
}) => {
  const styles = useMemo(() => getStyles(theme), [theme]);
  const [expanded, setExpanded] = useState(false);

  return (
    <ExpandableCard
      expanded={expanded}
      icon="refresh"
      onToggle={() => setExpanded((value) => !value)}
      theme={theme}
      title="Remote User Info Protocol"
    >
      <Text style={styles.description}>
        Fetch the latest profile data directly from the OIDC UserInfo endpoint
        using your Access Token.
      </Text>

      <DemoButton
        icon="refresh"
        label={isLoading ? 'Syncing...' : 'Sync with Remote UserInfo'}
        loading={isLoading}
        onPress={onFetchUserInfo}
        theme={theme}
      />

      {userInfo && (
        <View style={styles.userInfoResult}>
          <View style={styles.successBadge}>
            <MaterialIcons
              name="check-circle"
              size={18}
              color={theme.success}
            />
            <Text style={styles.successText}>Successfully synced!</Text>
          </View>

          <View style={styles.claimsContainer}>
            <Text style={styles.claimsTitle}>UserInfo Claims</Text>
            <View style={styles.claimsBox}>
              {Object.entries(userInfo.raw ?? userInfo).map(([key, value]) => (
                <View key={key} style={styles.claimRow}>
                  <Text style={styles.claimKey}>{key}:</Text>
                  <Text style={styles.claimValue}>{String(value)}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}
    </ExpandableCard>
  );
};

const getStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    description: {
      fontSize: UI.type.caption,
      color: theme.textCaption,
      lineHeight: 18,
      marginBottom: UI.spacing.lg,
    },
    userInfoResult: {
      marginTop: UI.spacing.lg,
    },
    successBadge: {
      backgroundColor: theme.successContainer,
      borderRadius: UI.radius.control,
      padding: UI.spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: UI.spacing.md,
    },
    successText: {
      color: theme.success,
      fontSize: UI.type.caption,
      fontWeight: 'bold',
      marginLeft: UI.spacing.sm,
    },
    claimsContainer: {
      marginTop: UI.spacing.xs,
    },
    claimsTitle: {
      fontSize: UI.type.caption,
      fontWeight: 'bold',
      color: theme.primary,
      marginBottom: UI.spacing.sm,
    },
    claimsBox: {
      backgroundColor: theme.surfaceVariant,
      borderRadius: UI.radius.control,
      padding: UI.spacing.md,
    },
    claimRow: {
      flexDirection: 'row',
      marginBottom: 2,
    },
    claimKey: {
      flexBasis: '38%',
      flexShrink: 0,
      fontSize: 11,
      fontWeight: 'bold',
      color: theme.textPrimary,
    },
    claimValue: {
      flex: 1,
      fontSize: 11,
      color: theme.textPrimary,
      opacity: 0.8,
    },
  });
