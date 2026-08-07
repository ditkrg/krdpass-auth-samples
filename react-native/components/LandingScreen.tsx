import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemeColors } from '../theme/colors';
import { KrdPassIcon } from '../assets/krdpass_icon';
import { MaterialIcons } from '@expo/vector-icons';
import { UI } from '../theme/metrics';
import { DemoButton } from './DemoButton';

interface LandingScreenProps {
  loading: boolean;
  error?: string | null;
  citizenScope: boolean;
  offlineScope: boolean;
  useServerMode: boolean;
  onCitizenScopeChange: (val: boolean) => void;
  onOfflineScopeChange: (val: boolean) => void;
  onServerModeChange: (val: boolean) => void;
  onSignIn: () => void;
  onClearError?: () => void;
  /** Store listing for KRDPASS, set only for provider_not_installed. */
  installUrl?: string | null;
  onInstallProvider?: () => void;
  theme: ThemeColors;
}

export const LandingScreen: React.FC<LandingScreenProps> = ({
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
  installUrl,
  onInstallProvider,
  theme,
}) => {
  const styles = useMemo(() => getStyles(theme), [theme]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.landingContent}>
        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <KrdPassIcon color="#FFF" size={36} />
          </View>
          <Text style={styles.appTitle}>KRDPASS</Text>
          <Text style={styles.appSubtitle}>Digital Identity Demo</Text>
          <Text style={styles.platformLabel}>
            Expo React Native on {Platform.OS === 'ios' ? 'iOS' : 'Android'}
          </Text>
        </View>

        {error && (
          <View style={styles.errorCard}>
            <View style={styles.errorIconChip}>
              <MaterialIcons name="warning" size={20} color={theme.error} />
            </View>
            <View style={styles.errorTextContainer}>
              <Text style={styles.errorTitle}>Sign-in failed</Text>
              <Text style={styles.errorText}>{error}</Text>
              {/*
                provider_not_installed is the only sign-in failure the user can actually
                fix, and the SDK hands us the URL that fixes it. Offer it as an action
                instead of ending on an error message.
              */}
              {installUrl && onInstallProvider && (
                <Text
                  accessibilityRole="button"
                  onPress={onInstallProvider}
                  style={styles.errorAction}
                >
                  Install KRDPASS
                </Text>
              )}
            </View>
            {onClearError && (
              <Pressable
                accessibilityLabel="Dismiss error"
                accessibilityRole="button"
                hitSlop={8}
                onPress={onClearError}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <MaterialIcons
                  name="close"
                  size={18}
                  color={theme.textPrimary}
                />
              </Pressable>
            )}
          </View>
        )}

        <View style={styles.card}>
          <ConfigToggle
            title="Citizen Data"
            subtitle="Include citizen_identity scope"
            value={citizenScope}
            onValueChange={onCitizenScopeChange}
            theme={theme}
          />
          <View style={styles.divider} />

          <ConfigToggle
            title="Offline Access"
            subtitle="Include offline_access scope (Refresh Token)"
            value={offlineScope}
            onValueChange={onOfflineScopeChange}
            theme={theme}
          />
          <View style={styles.divider} />

          <ConfigToggle
            title="Auth Mode"
            subtitle={
              useServerMode
                ? 'Backend-mediated (Secure)'
                : 'Direct (Client-only)'
            }
            value={useServerMode}
            onValueChange={onServerModeChange}
            subtitleColor={theme.primary}
            theme={theme}
          />
        </View>

        <DemoButton
          disabled={loading}
          icon="fingerprint"
          label="Sign in with KRDPASS"
          loading={loading}
          onPress={onSignIn}
          theme={theme}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

interface ConfigToggleProps {
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  subtitleColor?: string;
  theme: ThemeColors;
}

const ConfigToggle = ({
  title,
  subtitle,
  value,
  onValueChange,
  subtitleColor,
  theme,
}: ConfigToggleProps) => {
  const styles = useMemo(() => getStyles(theme), [theme]);
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleTextContainer}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text
          style={[
            styles.toggleSubtitle,
            subtitleColor && { color: subtitleColor },
          ]}
        >
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
};

const getStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    landingContent: {
      padding: UI.spacing.xl,
      flexGrow: 1,
      justifyContent: 'center',
    },
    logoContainer: {
      alignItems: 'center',
      marginBottom: UI.spacing.xxl,
    },
    logoCircle: {
      width: UI.size.logo,
      height: UI.size.logo,
      borderRadius: UI.size.logo / 2,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: UI.spacing.lg,
    },
    appTitle: {
      fontSize: UI.type.brandTitle,
      fontWeight: '900',
      color: theme.textPrimary,
      lineHeight: 34,
      marginBottom: UI.spacing.xs,
    },
    appSubtitle: {
      fontSize: UI.type.body,
      color: theme.textCaption,
      lineHeight: 20,
    },
    platformLabel: {
      fontSize: UI.type.caption,
      color: theme.textCaption,
      lineHeight: 16,
      marginTop: 2,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: UI.radius.feature,
      padding: UI.spacing.lg,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: UI.spacing.xl,
    },
    errorCard: {
      backgroundColor: theme.errorContainer,
      borderRadius: UI.radius.control,
      padding: UI.spacing.md,
      marginBottom: UI.spacing.lg,
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    errorIconChip: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: theme.error + '1F',
      alignItems: 'center',
      justifyContent: 'center',
    },
    errorAction: {
      color: theme.error,
      fontSize: 13,
      fontWeight: '700',
      marginTop: 6,
    },
    errorTextContainer: {
      flex: 1,
      marginHorizontal: UI.spacing.md,
    },
    errorTitle: {
      fontSize: UI.type.body,
      fontWeight: 'bold',
      color: theme.textPrimary,
      lineHeight: 20,
      marginBottom: 2,
    },
    errorText: {
      color: theme.textPrimary,
      opacity: 0.8,
      fontSize: UI.type.caption,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: UI.size.touchTarget,
    },
    toggleTextContainer: {
      flex: 1,
      paddingRight: UI.spacing.lg,
    },
    toggleTitle: {
      fontSize: UI.type.body,
      fontWeight: 'bold',
      color: theme.textPrimary,
    },
    toggleSubtitle: {
      fontSize: UI.type.caption,
      color: theme.textCaption,
      lineHeight: 16,
      marginTop: 2,
    },
    divider: {
      height: 1,
      backgroundColor: theme.border,
      opacity: 0.5,
      marginVertical: UI.spacing.md,
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
      opacity: 0.82,
    },
  });
