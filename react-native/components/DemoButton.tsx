import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ThemeColors } from '../theme/colors';
import { UI } from '../theme/metrics';

type ButtonTone = 'primary' | 'neutral' | 'success' | 'danger';

interface DemoButtonProps {
  label: string;
  onPress: () => void;
  theme: ThemeColors;
  tone?: ButtonTone;
  compact?: boolean;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof MaterialIcons.glyphMap;
}

export function DemoButton({
  label,
  onPress,
  theme,
  tone = 'primary',
  compact = false,
  disabled = false,
  loading = false,
  icon,
}: DemoButtonProps) {
  const colors = {
    primary: { background: theme.primary, foreground: '#FFFFFF' },
    neutral: {
      background: theme.btnSecondaryBg,
      foreground: theme.btnSecondaryText,
    },
    success: {
      background: theme.btnTertiaryBg,
      foreground: theme.btnTertiaryText,
    },
    danger: {
      background: theme.btnDangerBg,
      foreground: theme.btnDangerText,
    },
  }[tone];

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compactButton,
        { backgroundColor: colors.background },
        (disabled || loading) && styles.disabled,
        pressed && !disabled && !loading && styles.pressed,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={colors.foreground} size="small" />
        ) : icon ? (
          <MaterialIcons
            color={colors.foreground}
            name={icon}
            size={compact ? 18 : 20}
          />
        ) : null}
        <Text
          style={[
            styles.label,
            compact && styles.compactLabel,
            { color: colors.foreground },
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: UI.radius.card,
    height: UI.size.control,
    justifyContent: 'center',
    paddingHorizontal: UI.spacing.lg,
  },
  compactButton: {
    borderRadius: UI.radius.control,
    height: UI.size.compactControl,
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: UI.spacing.sm,
    justifyContent: 'center',
  },
  label: {
    fontSize: UI.type.section,
    fontWeight: '600',
  },
  compactLabel: {
    fontSize: UI.type.body,
    fontWeight: '500',
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.82,
  },
});
