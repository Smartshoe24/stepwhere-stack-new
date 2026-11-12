import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { StatusDot } from '@/components/ui/status-dot';
import type { OverviewChildCard } from '@/features/overview/overview-ui';

type ChildAvatarItemProps = {
  child: OverviewChildCard;
  selected: boolean;
  onPress: () => void;
};

export function ChildAvatarItem({ child, onPress, selected }: ChildAvatarItemProps) {
  const { theme } = useUnistyles();

  return (
    <Pressable
      accessibilityLabel={`${child.name}, ${child.statusLabel}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}>
      <View style={styles.avatarWrap}>
        <Avatar
          backgroundColor={theme.colors.avatar.tones[child.avatarTone]}
          imageUrl={child.avatarUrl}
          initials={child.initials}
          ringColor={styles.statusRing(child.status).borderColor as string}
          size={selected ? 60 : 58}
          textSize={16}
        />
        {child.status === 'alert' ? (
          <View style={styles.alertBadge}>
            <Badge label="!" />
          </View>
        ) : (
          <View style={styles.dotWrap}>
            <StatusDot size={10} status={child.status} />
          </View>
        )}
      </View>
      <Text style={styles.name}>{child.name}</Text>
      <Text numberOfLines={1} style={styles.statusLabel(child.status)}>
        {child.statusLabel}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create(theme => ({
  container: {
    width: 64,
    alignItems: 'center',
    gap: 4,
  },
  pressed: {
    opacity: 0.82,
  },
  avatarWrap: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusRing: (status: OverviewChildCard['status']) => ({
    borderColor: theme.status[status].border,
  }),
  alertBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  dotWrap: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 14,
    height: 14,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  name: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: theme.typography.size.childName,
    lineHeight: 14,
    fontWeight: theme.typography.weight.medium,
  },
  statusLabel: (status: OverviewChildCard['status']) => ({
    color: theme.status[status].text,
    maxWidth: 64,
    textAlign: 'center',
    fontFamily: theme.typography.family.body,
    fontSize: theme.typography.size.childStatus,
    lineHeight: 12,
    fontWeight: theme.typography.weight.regular,
  }),
}));
