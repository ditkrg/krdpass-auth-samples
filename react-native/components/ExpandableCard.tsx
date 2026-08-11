import { MaterialIcons } from '@expo/vector-icons';
import React, { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ThemeColors } from '../theme/colors';
import { UI } from '../theme/metrics';

interface ExpandableCardProps {
  title: string;
  icon: keyof typeof MaterialIcons.glyphMap;
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
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <View style={styles.headerTitle}>
          <MaterialIcons color={theme.primary} name={icon} size={20} />
          <Text style={[styles.title, { color: theme.textPrimary }]}>
            {title}
          </Text>
        </View>
        <MaterialIcons
          color={theme.textCaption}
          name={expanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
          size={20}
        />
      </Pressable>
      {expanded ? <View style={styles.content}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: UI.radius.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: UI.size.control,
    padding: UI.spacing.lg,
  },
  headerTitle: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
  },
  title: {
    fontSize: UI.type.body,
    fontWeight: '700',
    lineHeight: 20,
    marginLeft: UI.spacing.md,
  },
  content: {
    paddingBottom: UI.spacing.lg,
    paddingHorizontal: UI.spacing.lg,
  },
  pressed: {
    opacity: 0.72,
  },
});
