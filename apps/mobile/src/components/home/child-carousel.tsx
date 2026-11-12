import React from 'react';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AddChildButton } from '@/components/home/add-child-button';
import { ChildAvatarItem } from '@/components/home/child-avatar-item';
import type { OverviewChildCard } from '@/features/overview/overview-ui';

type ChildCarouselProps = {
  childrenData: OverviewChildCard[];
  onAddChildPress?: () => void;
  onChildPress: (childId: string) => void;
  selectedChildId: string;
  showAddChildButton?: boolean;
};

export function ChildCarousel({
  childrenData,
  onAddChildPress,
  onChildPress,
  selectedChildId,
  showAddChildButton = true,
}: ChildCarouselProps) {
  return (
    <ScrollView
      horizontal
      contentContainerStyle={styles.content}
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}>
      {childrenData.map(child => (
        <ChildAvatarItem
          key={child.id}
          child={child}
          onPress={() => onChildPress(child.id)}
          selected={selectedChildId === child.id}
        />
      ))}
      {showAddChildButton ? <AddChildButton onPress={onAddChildPress} /> : null}
      <View style={styles.trailingSpace} />
    </ScrollView>
  );
}

const styles = StyleSheet.create(theme => ({
  scroll: {
    maxHeight: 108,
  },
  content: {
    alignItems: 'flex-start',
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[5],
    paddingBottom: theme.spacing[2],
  },
  trailingSpace: {
    width: 6,
  },
}));
