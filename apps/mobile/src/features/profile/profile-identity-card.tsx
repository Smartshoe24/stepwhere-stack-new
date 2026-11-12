import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AppIcon } from '@/components/ui/app-icon';

type ProfileIdentityCardProps = {
  avatarInitials: string;
  avatarUrl: string | null;
  canManageJoinCodes: boolean;
  displayName: string;
  email: string;
  familyMeta: string;
  isVerified: boolean;
  onAvatarPress: () => void;
  onEditPress: () => void;
  onInvitePress: () => void;
  onMembersPress: () => void;
  phoneNumber: string;
  protectingSince: string;
};

export function ProfileIdentityCard({
  avatarInitials,
  avatarUrl,
  canManageJoinCodes,
  displayName,
  email,
  familyMeta,
  isVerified,
  onAvatarPress,
  onEditPress,
  onInvitePress,
  onMembersPress,
  phoneNumber,
  protectingSince,
}: ProfileIdentityCardProps) {
  const { theme } = useUnistyles();
  const avatarGradient: [string, string] = [
    theme.colors.avatar.parentGradientStart,
    theme.colors.avatar.parentGradientEnd,
  ];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable
            accessibilityLabel={
              avatarUrl ? 'Expand parent profile photo' : 'Add parent profile photo'
            }
            accessibilityRole="button"
            onPress={onAvatarPress}
            style={({ pressed }) => [styles.avatarWrap, pressed && styles.pressed]}
          >
            {avatarUrl ? (
              <LinearGradient
                colors={avatarGradient}
                end={{ x: 1, y: 0.5 }}
                start={{ x: 0, y: 0.5 }}
                style={styles.avatarPhotoRing}
              >
                <Image contentFit="cover" source={{ uri: avatarUrl }} style={styles.avatarImage} />
              </LinearGradient>
            ) : (
              <LinearGradient
                colors={avatarGradient}
                end={{ x: 1, y: 0.5 }}
                start={{ x: 0, y: 0.5 }}
                style={styles.avatarGradientFill}
              >
                <Text style={styles.avatarInitials}>{avatarInitials}</Text>
              </LinearGradient>
            )}
          </Pressable>

          <View style={styles.info}>
            <Text numberOfLines={2} style={styles.name}>
              {displayName}
            </Text>
            <View style={styles.contactList}>
              <View style={styles.contactRow}>
                <AppIcon color={styles.contactIcon.color} name="cellphone" size={16} />
                <Text numberOfLines={1} style={styles.contactText}>
                  {phoneNumber}
                </Text>
              </View>
              <View style={styles.contactRow}>
                <AppIcon color={styles.contactIcon.color} name="email" size={16} />
                <Text numberOfLines={1} style={styles.contactText}>
                  {email}
                </Text>
              </View>
            </View>
            {/* Tinted chip pair, never white-on-accent. */}
            <View style={styles.verificationBadge(isVerified)}>
              <AppIcon
                color={
                  isVerified
                    ? styles.verificationIcon.color
                    : styles.verificationIconSuspended.color
                }
                name={isVerified ? 'shield-check' : 'shield-off'}
                size={14}
              />
              <Text style={styles.verificationText(isVerified)}>
                {isVerified ? 'Verified parent' : 'Account suspended'}
              </Text>
            </View>
          </View>
        </View>

        <Pressable
          accessibilityLabel="Edit parent profile"
          accessibilityRole="button"
          onPress={onEditPress}
          style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
        >
          <AppIcon color={styles.editIcon.color} name="pencil" size={18} />
        </Pressable>
      </View>

      <View style={styles.metaStrip}>
        <View style={styles.metaItem}>
          <AppIcon color={styles.metaIcon.color} name="calendar" size={16} />
          <Text style={styles.metaText}>{`Protecting since ${protectingSince}`}</Text>
        </View>
        <View style={styles.metaDivider} />
        <Pressable
          accessibilityLabel="View connected family members"
          accessibilityRole="button"
          onPress={onMembersPress}
          style={({ pressed }) => [styles.metaItem, pressed && styles.pressed]}
        >
          <AppIcon color={styles.metaIcon.color} name="family" size={16} />
          <Text style={styles.metaText}>{familyMeta}</Text>
          <AppIcon color={styles.metaChevron.color} name="chevron-right" size={16} />
        </Pressable>
      </View>

      {canManageJoinCodes ? (
        <Pressable
          accessibilityLabel="Invite a family member"
          accessibilityRole="button"
          onPress={onInvitePress}
          style={({ pressed }) => [styles.inviteRow, pressed && styles.pressed]}
        >
          <View style={styles.inviteIconPlate}>
            <AppIcon color={styles.inviteIcon.color} name="account-plus" size={18} />
          </View>
          <View style={styles.inviteCopy}>
            <Text style={styles.inviteTitle}>Invite member</Text>
            <Text style={styles.inviteSubtitle}>Share a 15-minute family invite.</Text>
          </View>
          <AppIcon color={styles.inviteChevron.color} name="qrcode" size={18} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create(theme => ({
  card: {
    marginTop: theme.spacing[4],
    marginHorizontal: theme.spacing[5],
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing[4],
    ...theme.shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[3],
  },
  headerRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[3],
  },
  editButton: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
  },
  editIcon: {
    color: theme.colors.icon,
  },
  avatarWrap: {
    width: 72,
  },
  avatarPhotoRing: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.circle,
    padding: 3,
  },
  avatarGradientFill: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 66,
    height: 66,
    borderRadius: theme.radius.circle,
  },
  avatarInitials: {
    color: theme.colors.avatar.onParentGradient,
    fontFamily: theme.typography.family.display,
    ...theme.typography.text.metric,
    fontWeight: theme.typography.weight.semibold,
  },
  info: {
    flex: 1,
    gap: theme.spacing[2],
  },
  name: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    ...theme.typography.text.titleSmall,
    fontWeight: theme.typography.weight.semibold,
  },
  contactList: {
    gap: theme.spacing[1],
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
  },
  contactIcon: {
    color: theme.colors.textSecondary,
  },
  contactText: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
  },
  verificationBadge: (verified: boolean) => ({
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.radius.pill,
    backgroundColor: verified
      ? theme.colors.softGreen
      : theme.colors.alertBackground,
  }),
  verificationIcon: {
    color: theme.colors.telemetry.positiveText,
  },
  verificationIconSuspended: {
    color: theme.colors.alertText,
  },
  verificationText: (verified: boolean) => ({
    color: verified ? theme.colors.telemetry.positiveText : theme.colors.alertText,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.caption,
    fontWeight: theme.typography.weight.semibold,
  }),
  metaStrip: {
    marginTop: theme.spacing[4],
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: theme.radius.cardSmall,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surfaceMuted,
  },
  metaItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  metaDivider: {
    width: 1,
    backgroundColor: theme.colors.divider,
  },
  metaIcon: {
    color: theme.colors.textSecondary,
  },
  metaChevron: {
    color: theme.colors.textMuted,
  },
  metaText: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
  },
  inviteRow: {
    marginTop: theme.spacing[3],
    minHeight: 56,
    borderRadius: theme.radius.cardSmall,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  inviteIconPlate: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.softGreen,
  },
  inviteIcon: {
    color: theme.colors.primaryGreen,
  },
  inviteCopy: {
    flex: 1,
    gap: 2,
  },
  inviteTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    ...theme.typography.text.bodyLarge,
    fontWeight: theme.typography.weight.medium,
  },
  inviteSubtitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
  },
  inviteChevron: {
    color: theme.colors.textMuted,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
