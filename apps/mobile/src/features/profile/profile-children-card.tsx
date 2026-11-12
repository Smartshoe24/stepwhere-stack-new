import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AddChildButton } from '@/components/home/add-child-button';
import { AppIcon } from '@/components/ui/app-icon';
import { Avatar } from '@/components/ui/avatar';
import type { OverviewChildCard } from '@/features/overview/overview-ui';

import { formatConnectedChildrenSummary } from './profile-formatters';

const MAX_VISIBLE_CHILDREN = 3;

type ProfileChildrenCardProps = {
  canManageChildren: boolean;
  childrenData: OverviewChildCard[];
  onAddChildPress: () => void;
  onChildPress: (childId: string) => void;
};

export function ProfileChildrenCard({
  canManageChildren,
  childrenData,
  onAddChildPress,
  onChildPress,
}: ProfileChildrenCardProps) {
  const { theme } = useUnistyles();
  const visibleChildren = childrenData.slice(0, MAX_VISIBLE_CHILDREN);
  const overflowCount = Math.max(childrenData.length - visibleChildren.length, 0);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconPlate}>
          <AppIcon color={styles.icon.color} name="children" size={16} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Connected children</Text>
          <Text style={styles.summary}>
            {formatConnectedChildrenSummary(childrenData.length)}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        {childrenData.length > 0 ? (
          <View style={styles.previewRow}>
            {visibleChildren.map(child => {
              const avatar = (
                <Avatar
                  backgroundColor={theme.colors.avatar.tones[child.avatarTone]}
                  imageUrl={child.avatarUrl}
                  initials={child.initials}
                  ringColor={theme.status[child.status].border}
                  size={48}
                  textSize={13}
                />
              );

              if (!canManageChildren) {
                return (
                  <View
                    accessible
                    accessibilityLabel={`${child.name}, ${child.statusLabel}`}
                    key={child.id}
                    style={styles.childPreview}
                  >
                    {avatar}
                    <Text numberOfLines={1} style={styles.childName}>
                      {child.name}
                    </Text>
                  </View>
                );
              }

              return (
                <Pressable
                  accessibilityLabel={`Edit ${child.name}`}
                  accessibilityRole="button"
                  key={child.id}
                  onPress={() => onChildPress(child.id)}
                  style={({ pressed }) => [styles.childPreview, pressed && styles.pressed]}
                >
                  {avatar}
                  <Text numberOfLines={1} style={styles.childName}>
                    {child.name}
                  </Text>
                </Pressable>
              );
            })}

            {overflowCount > 0 ? (
              <View
                accessible
                accessibilityLabel={`${overflowCount} more children`}
                style={styles.overflowWrap}
              >
                <View style={styles.overflowCircle}>
                  <Text style={styles.overflowText}>{`+${overflowCount}`}</Text>
                </View>
              </View>
            ) : null}

            {canManageChildren ? (
              <View style={styles.addChildWrap}>
                <AddChildButton onPress={onAddChildPress} size="compact" />
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.emptyRow}>
            <Text style={styles.emptyText}>No children connected</Text>
            {canManageChildren ? (
              <View style={styles.addChildWrap}>
                <AddChildButton onPress={onAddChildPress} size="compact" />
              </View>
            ) : null}
          </View>
        )}
      </View>
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
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  iconPlate: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.softGreen,
  },
  icon: {
    color: theme.colors.primaryGreen,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    ...theme.typography.text.bodyLarge,
    fontWeight: theme.typography.weight.semibold,
  },
  summary: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.caption,
    ...theme.typography.tabular,
    fontWeight: theme.typography.weight.medium,
  },
  body: {
    marginTop: theme.spacing[4],
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: theme.spacing[3],
  },
  childPreview: {
    width: 52,
    alignItems: 'center',
    gap: theme.spacing[1],
  },
  childName: {
    width: '100%',
    color: theme.colors.textSecondary,
    textAlign: 'center',
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.overline,
    letterSpacing: 0,
    fontWeight: theme.typography.weight.medium,
  },
  overflowWrap: {
    width: 52,
    alignItems: 'center',
  },
  overflowCircle: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
  },
  overflowText: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.display,
    ...theme.typography.text.body,
    ...theme.typography.tabular,
    fontWeight: theme.typography.weight.semibold,
  },
  addChildWrap: {
    width: 64,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  emptyText: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.body,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
