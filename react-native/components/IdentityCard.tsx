import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ThemeColors } from '../theme/colors';
import { UI } from '../theme/metrics';

interface IdentityCardProps {
  fullName: string;
  email: string;
  profilePicUrl?: string | null;
  theme: ThemeColors;
}

export const IdentityCard: React.FC<IdentityCardProps> = ({
  fullName,
  email,
  profilePicUrl,
  theme,
}) => {
  const styles = useMemo(() => getStyles(theme), [theme]);
  const [failedImageUrl, setFailedImageUrl] = useState<string>();

  return (
    <View style={styles.card}>
      <View style={styles.contentRow}>
        <View style={styles.profileContainer}>
          {profilePicUrl && failedImageUrl !== profilePicUrl ? (
            <Image
              onError={() => setFailedImageUrl(profilePicUrl)}
              source={{ uri: profilePicUrl }}
              style={styles.profileImage}
            />
          ) : (
            <MaterialIcons name="person" size={32} color={theme.primary} />
          )}
        </View>

        <View style={styles.textContainer}>
          <Text style={styles.name} numberOfLines={2}>
            {fullName}
          </Text>
          <Text style={styles.email} numberOfLines={1}>
            {email}
          </Text>
        </View>
      </View>

      <View style={styles.badgeContainer}>
        <View style={styles.badgeContent}>
          <MaterialIcons name="check-circle" size={16} color={theme.success} />
          <Text style={styles.badgeText}>Official Verified Citizen</Text>
        </View>
      </View>
    </View>
  );
};

const getStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: UI.radius.feature,
      padding: UI.spacing.lg,
      marginBottom: 0,
      borderWidth: 1,
      borderColor: theme.border,
    },
    contentRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 20,
    },
    profileContainer: {
      width: UI.size.avatar,
      height: UI.size.avatar,
      borderRadius: UI.size.avatar / 2,
      backgroundColor: theme.btnSecondaryBg,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    profileImage: {
      width: '100%',
      height: '100%',
    },
    textContainer: {
      flex: 1,
      marginLeft: UI.spacing.lg,
    },
    name: {
      fontSize: UI.type.cardTitle,
      fontWeight: 'bold',
      color: theme.textPrimary,
      marginBottom: 2,
    },
    email: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.textCaption,
    },
    badgeContainer: {
      backgroundColor: theme.successContainer,
      borderRadius: UI.radius.control,
      borderWidth: 1,
      borderColor: theme.success + '33',
      paddingVertical: UI.spacing.sm,
      alignItems: 'center',
    },
    badgeContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    badgeText: {
      fontSize: UI.type.caption,
      fontWeight: '600',
      color: theme.success,
      lineHeight: 16,
      marginLeft: UI.spacing.sm,
    },
  });
