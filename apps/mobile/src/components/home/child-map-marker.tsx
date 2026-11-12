import React from 'react';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AvatarPin } from '@/components/ui/avatar-pin';
import type { OverviewChildCard } from '@/features/overview/overview-ui';

type ChildMapMarkerProps = {
  active: boolean;
  child: OverviewChildCard;
  mapReady?: boolean;
};

export function ChildMapMarker({ active: _active, child }: ChildMapMarkerProps) {
  const { theme } = useUnistyles();

  return (
    <View pointerEvents="none" style={styles.container}>
      <AvatarPin
        backgroundColor={theme.colors.avatar.tones[child.avatarTone]}
        imageUrl={child.avatarUrl}
        initials={child.initials}
        ringColor={theme.status[child.status].border}
      />
    </View>
  );
}

const styles = StyleSheet.create(theme => ({
  container: {
    position: 'absolute',
    top: '42%',
    left: '50%',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateX: -32 }, { translateY: -66 }],
  },
}));
