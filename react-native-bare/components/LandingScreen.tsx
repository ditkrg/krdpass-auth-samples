import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import React from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemeColors, UI } from '../theme';
import { ActionButton } from './DemoUi';

interface LandingScreenProps {
  loading: boolean;
  error?: string;
  citizenScope: boolean;
  offlineScope: boolean;
  useServerMode: boolean;
  onCitizenScopeChange: (value: boolean) => void;
  onOfflineScopeChange: (value: boolean) => void;
  onServerModeChange: (value: boolean) => void;
  onSignIn: () => void;
  onClearError: () => void;
  theme: ThemeColors;
}

export function LandingScreen({
  loading,
  error,
  citizenScope,
  offlineScope,
  useServerMode,
  onCitizenScopeChange,
  onOfflineScopeChange,
  onServerModeChange,
  onSignIn,
  onClearError,
  theme,
}: LandingScreenProps) {
  const styles = getStyles(theme);

  return (
    <SafeAreaView
      edges={['top', 'right', 'bottom', 'left']}
      style={styles.root}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoGroup}>
          <View style={styles.logo}>
            <MaterialIcons color="#FFFFFF" name="fingerprint" size={38} />
          </View>
          <Text style={styles.title}>KRDPASS</Text>
          <Text style={styles.subtitle}>Digital Identity Demo</Text>
          <Text style={styles.platformLabel}>
            Bare React Native on {Platform.OS === 'ios' ? 'iOS' : 'Android'}
          </Text>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <View style={styles.errorIcon}>
              <MaterialIcons color={theme.error} name="warning" size={20} />
            </View>
            <View style={styles.errorCopy}>
              <Text style={styles.errorTitle}>Sign-in failed</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
            <Pressable
              accessibilityLabel="Dismiss error"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClearError}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <MaterialIcons color={theme.textPrimary} name="close" size={18} />
            </Pressable>
          </View>
        ) : null}

        <View style={styles.configurationCard}>
          <ToggleRow
            onValueChange={onCitizenScopeChange}
            subtitle="Include citizen_identity scope"
            theme={theme}
            title="Citizen Data"
            value={citizenScope}
          />
          <View style={styles.divider} />
          <ToggleRow
            onValueChange={onOfflineScopeChange}
            subtitle="Include offline_access scope (Refresh Token)"
            theme={theme}
            title="Offline Access"
            value={offlineScope}
          />
          <View style={styles.divider} />
          <ToggleRow
            onValueChange={onServerModeChange}
            primary
            subtitle={
              useServerMode
                ? 'Backend-mediated (Secure)'
                : 'Direct (Client-only)'
            }
            theme={theme}
            title="Auth Mode"
            value={useServerMode}
          />
        </View>

        <ActionButton
          icon="fingerprint"
          label="Sign in with KRDPASS"
          loading={loading}
          onPress={onSignIn}
          theme={theme}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function ToggleRow({
  title,
  subtitle,
  value,
  onValueChange,
  primary = false,
  theme,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  primary?: boolean;
  theme: ThemeColors;
}) {
  const styles = getStyles(theme);

  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleCopy}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={[styles.toggleSubtitle, primary && styles.primaryText]}>
          {subtitle}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={title}
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
        hitSlop={8}
        onPress={() => onValueChange(!value)}
        style={[styles.switchTrack, value && styles.switchTrackOn]}
      >
        <View style={[styles.switchThumb, value && styles.switchThumbOn]} />
      </Pressable>
    </View>
  );
}

const getStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    root: {
      backgroundColor: theme.background,
      flex: 1,
    },
    content: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: UI.spacing.xl,
    },
    logoGroup: {
      alignItems: 'center',
      marginBottom: UI.spacing.xxl,
    },
    logo: {
      alignItems: 'center',
      backgroundColor: theme.primary,
      borderRadius: UI.size.logo / 2,
      height: UI.size.logo,
      justifyContent: 'center',
      marginBottom: UI.spacing.lg,
      width: UI.size.logo,
    },
    title: {
      color: theme.textPrimary,
      fontSize: UI.type.brandTitle,
      fontWeight: '900',
      lineHeight: 34,
      marginBottom: UI.spacing.xs,
    },
    subtitle: {
      color: theme.textCaption,
      fontSize: UI.type.body,
      lineHeight: 20,
    },
    platformLabel: {
      color: theme.textCaption,
      fontSize: UI.type.caption,
      lineHeight: 16,
      marginTop: 2,
    },
    errorCard: {
      alignItems: 'flex-start',
      backgroundColor: theme.errorContainer,
      borderRadius: UI.radius.control,
      flexDirection: 'row',
      marginBottom: UI.spacing.lg,
      padding: UI.spacing.md,
    },
    errorIcon: {
      alignItems: 'center',
      backgroundColor: `${theme.error}1F`,
      borderRadius: 10,
      height: 36,
      justifyContent: 'center',
      width: 36,
    },
    errorCopy: {
      flex: 1,
      marginHorizontal: UI.spacing.md,
    },
    errorTitle: {
      color: theme.textPrimary,
      fontSize: UI.type.body,
      fontWeight: '700',
      lineHeight: 20,
      marginBottom: 2,
    },
    errorText: {
      color: theme.textPrimary,
      fontSize: UI.type.caption,
      lineHeight: 16,
      opacity: 0.8,
    },
    configurationCard: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: UI.radius.feature,
      borderWidth: 1,
      marginBottom: UI.spacing.xl,
      padding: UI.spacing.lg,
    },
    toggleRow: {
      alignItems: 'center',
      flexDirection: 'row',
      minHeight: UI.size.touchTarget,
    },
    toggleCopy: {
      flex: 1,
      paddingRight: UI.spacing.lg,
    },
    toggleTitle: {
      color: theme.textPrimary,
      fontSize: UI.type.body,
      fontWeight: '700',
      lineHeight: 20,
    },
    toggleSubtitle: {
      color: theme.textCaption,
      fontSize: UI.type.caption,
      lineHeight: 16,
      marginTop: 2,
    },
    primaryText: {
      color: theme.primary,
    },
    divider: {
      backgroundColor: theme.border,
      height: 1,
      marginVertical: UI.spacing.md,
      opacity: 0.5,
    },
    // Material 3 switch proportions, so the toggles match the Compose and Flutter
    // demos. React Native's built-in Switch renders the older platform widget,
    // which the colour props cannot reshape.
    switchTrack: {
      width: 42,
      height: 26,
      borderRadius: 13,
      borderWidth: 2,
      borderColor: theme.textCaption,
      backgroundColor: theme.surfaceVariant,
      flexDirection: 'row',
      alignItems: 'center',
    },
    switchTrackOn: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    switchThumb: {
      marginLeft: 4,
      width: 13,
      height: 13,
      borderRadius: 6.5,
      backgroundColor: theme.textCaption,
    },
    switchThumbOn: {
      marginLeft: 18,
      width: 19,
      height: 19,
      borderRadius: 9.5,
      backgroundColor: '#FFFFFF',
    },
    pressed: {
      opacity: 0.72,
    },
  });
