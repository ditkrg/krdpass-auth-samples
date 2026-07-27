import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ThemeColors } from '../theme/colors';
import { UI } from '../theme/metrics';
import { ExpandableCard } from './ExpandableCard';

interface TokenDetailsCardProps {
  idClaims: Record<string, unknown>;
  accessClaims: Record<string, unknown>;
  theme: ThemeColors;
}

export function TokenDetailsCard({
  idClaims,
  accessClaims,
  theme,
}: TokenDetailsCardProps) {
  const styles = useMemo(() => getStyles(theme), [theme]);
  const [expanded, setExpanded] = useState(false);

  return (
    <ExpandableCard
      expanded={expanded}
      icon="lock"
      onToggle={() => setExpanded((value) => !value)}
      theme={theme}
      title="Token Details"
    >
      <View style={styles.content}>
        <ClaimSection data={idClaims} styles={styles} title="ID Token Claims" />
        <ClaimSection
          data={accessClaims}
          styles={styles}
          title="Access Token Claims"
        />
      </View>
    </ExpandableCard>
  );
}

function ClaimSection({
  title,
  data,
  styles,
}: {
  title: string;
  data: Record<string, unknown>;
  styles: ReturnType<typeof getStyles>;
}) {
  const entries = Object.entries(data);

  return (
    <View style={styles.claimSection}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.claimsBox}>
        {entries.length === 0 ? (
          <Text style={styles.emptyText}>No claims available</Text>
        ) : (
          entries.map(([key, value]) => (
            <View key={key} style={styles.claimRow}>
              <Text style={styles.claimKey}>{key}:</Text>
              <Text style={styles.claimValue}>{String(value)}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const getStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    content: {
      gap: UI.spacing.md,
    },
    claimSection: {
      gap: UI.spacing.sm,
    },
    sectionTitle: {
      color: theme.primary,
      fontSize: UI.type.caption,
      fontWeight: '700',
    },
    claimsBox: {
      backgroundColor: theme.surfaceVariant,
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
      color: theme.primary,
      flexBasis: '38%',
      flexShrink: 0,
      fontSize: 11,
      fontWeight: '600',
    },
    claimValue: {
      color: theme.textPrimary,
      flex: 1,
      fontSize: 11,
    },
    emptyText: {
      color: theme.textCaption,
      fontSize: UI.type.caption,
      fontStyle: 'italic',
    },
  });
