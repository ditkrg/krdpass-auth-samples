import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import React, { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ThemeColors, UI } from '../theme';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];
type ButtonTone = 'primary' | 'neutral' | 'success' | 'danger';

interface ActionButtonProps {
  label: string;
  onPress: () => void;
  theme: ThemeColors;
  tone?: ButtonTone;
  compact?: boolean;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
}

export function ActionButton({
  label,
  onPress,
  theme,
  tone = 'primary',
  compact = false,
  disabled = false,
  loading = false,
  icon,
}: ActionButtonProps) {
  const colors = {
    primary: { background: theme.primary, foreground: '#FFFFFF' },
    neutral: {
      background: theme.primaryContainer,
      foreground: theme.primary,
    },
    success: {
      background: theme.successContainer,
      foreground: theme.success,
    },
    danger: {
      background: theme.errorContainer,
      foreground: theme.error,
    },
  }[tone];

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        compact && styles.compactButton,
        { backgroundColor: colors.background },
        (disabled || loading) && styles.disabled,
        pressed && !disabled && !loading && styles.pressed,
      ]}
    >
      <View style={styles.actionContent}>
        {loading ? (
          <ActivityIndicator color={colors.foreground} size="small" />
        ) : icon ? (
          <MaterialIcons color={colors.foreground} name={icon} size={20} />
        ) : null}
        <Text
          style={[
            styles.actionLabel,
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

interface ExpandableCardProps {
  title: string;
  icon: IconName;
  expanded: boolean;
  onToggle: () => void;
  theme: ThemeColors;
  children: ReactNode;
}

export function ExpandableCard({
  title,
  icon,
  expanded,
  onToggle,
  theme,
  children,
}: ExpandableCardProps) {
  return (
    <View
      style={[
        styles.expandableCard,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={({ pressed }) => [
          styles.expandableHeader,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.expandableTitleRow}>
          <MaterialIcons color={theme.primary} name={icon} size={20} />
          <Text style={[styles.expandableTitle, { color: theme.textPrimary }]}>
            {title}
          </Text>
        </View>
        <MaterialIcons
          color={theme.textCaption}
          name={expanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
          size={20}
        />
      </Pressable>
      {expanded ? (
        <View style={styles.expandableContent}>{children}</View>
      ) : null}
    </View>
  );
}

export function ClaimSection({
  title,
  claims,
  theme,
}: {
  title: string;
  claims: Record<string, unknown>;
  theme: ThemeColors;
}) {
  const entries = Object.entries(claims);

  return (
    <View style={styles.claimSection}>
      <Text style={[styles.claimSectionTitle, { color: theme.primary }]}>
        {title}
      </Text>
      <View
        style={[styles.claimsBox, { backgroundColor: theme.surfaceVariant }]}
      >
        {entries.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.textCaption }]}>
            No claims available
          </Text>
        ) : (
          entries.map(([key, value]) => (
            <View key={key} style={styles.claimRow}>
              <Text style={[styles.claimKey, { color: theme.primary }]}>
                {key}:
              </Text>
              <Text style={[styles.claimValue, { color: theme.textPrimary }]}>
                {String(value)}
              </Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

export type ActionMessage = { kind: 'ok' | 'error'; text: string };

export function ActionMessageView({
  message,
  theme,
}: {
  message?: ActionMessage | null;
  theme: ThemeColors;
}) {
  if (!message) {
    return null;
  }

  const isError = message.kind === 'error';
  const foreground = isError ? theme.error : theme.success;

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.message,
        {
          backgroundColor: isError
            ? theme.errorContainer
            : theme.successContainer,
        },
      ]}
    >
      <MaterialIcons
        color={foreground}
        name={isError ? 'error' : 'check-circle'}
        size={16}
      />
      <Text style={[styles.messageText, { color: foreground }]}>
        {message.text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actionButton: {
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
  actionContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: UI.spacing.sm,
    justifyContent: 'center',
  },
  actionLabel: {
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
    opacity: 0.78,
  },
  expandableCard: {
    borderRadius: UI.radius.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  expandableHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: UI.size.control,
    padding: UI.spacing.lg,
  },
  expandableTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
  },
  expandableTitle: {
    fontSize: UI.type.body,
    fontWeight: '700',
    lineHeight: 20,
    marginLeft: UI.spacing.md,
  },
  expandableContent: {
    paddingBottom: UI.spacing.lg,
    paddingHorizontal: UI.spacing.lg,
  },
  claimSection: {
    gap: UI.spacing.sm,
  },
  claimSectionTitle: {
    fontSize: UI.type.caption,
    fontWeight: '700',
  },
  claimsBox: {
    borderRadius: UI.radius.control,
    gap: UI.spacing.xs,
    padding: UI.spacing.md,
  },
  claimRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: UI.spacing.sm,
  },
  claimKey: {
    flexBasis: '38%',
    flexShrink: 0,
    fontSize: 11,
    fontWeight: '600',
  },
  claimValue: {
    flex: 1,
    fontSize: 11,
  },
  emptyText: {
    fontSize: UI.type.caption,
    fontStyle: 'italic',
  },
  message: {
    alignItems: 'center',
    borderRadius: UI.radius.control,
    flexDirection: 'row',
    gap: UI.spacing.sm,
    padding: UI.spacing.md,
  },
  messageText: {
    flex: 1,
    fontSize: UI.type.caption,
    fontWeight: '600',
    lineHeight: 18,
  },
});
