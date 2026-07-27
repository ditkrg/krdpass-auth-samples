import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ThemeColors } from '../theme/colors';
import { UI } from '../theme/metrics';
import { DemoButton } from './DemoButton';

interface TokenManagementCardProps {
  onVerifyToken: () => void;
  onRefreshToken: () => void;
  onRevokeToken: () => void;
  theme: ThemeColors;
  actionMessage?: string | null;
  disabled?: boolean;
}

export const TokenManagementCard: React.FC<TokenManagementCardProps> = ({
  onVerifyToken,
  onRefreshToken,
  onRevokeToken,
  theme,
  actionMessage,
  disabled = false,
}) => {
  const styles = useMemo(() => getStyles(theme), [theme]);
  const isError = actionMessage?.startsWith('❌') ?? false;
  const statusText = actionMessage?.replace(/^[✅❌]\s*/, '');

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <MaterialIcons name="settings" size={20} color={theme.primary} />
        <Text style={styles.title}>Token Management</Text>
      </View>

      {actionMessage && (
        <View
          style={[
            styles.statusContainer,
            {
              backgroundColor: isError
                ? theme.errorContainer
                : theme.successContainer,
            },
          ]}
        >
          <MaterialIcons
            name={isError ? 'error' : 'check-circle'}
            size={16}
            color={isError ? theme.error : theme.success}
          />
          <Text
            style={[
              styles.statusText,
              { color: isError ? theme.error : theme.success },
            ]}
          >
            {statusText}
          </Text>
        </View>
      )}

      <View style={styles.content}>
        <DemoButton
          compact
          disabled={disabled}
          label="Verify Token Signature"
          onPress={onVerifyToken}
          theme={theme}
          tone="neutral"
        />
        <DemoButton
          compact
          disabled={disabled}
          label="Refresh Access Token"
          onPress={onRefreshToken}
          theme={theme}
          tone="success"
        />
        <DemoButton
          compact
          disabled={disabled}
          label="Revoke Token (Log Out)"
          onPress={onRevokeToken}
          theme={theme}
          tone="danger"
        />
      </View>
    </View>
  );
};

const getStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: UI.radius.card,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden',
      padding: UI.spacing.lg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: UI.spacing.lg,
    },
    title: {
      fontWeight: 'bold',
      fontSize: UI.type.body,
      color: theme.textPrimary,
      marginLeft: UI.spacing.md,
    },
    content: {
      gap: UI.spacing.sm,
    },
    statusContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: UI.radius.control,
      gap: UI.spacing.sm,
      marginBottom: UI.spacing.lg,
      padding: UI.spacing.md,
    },
    statusText: {
      flex: 1,
      fontSize: UI.type.caption,
      fontWeight: '600',
    },
  });
