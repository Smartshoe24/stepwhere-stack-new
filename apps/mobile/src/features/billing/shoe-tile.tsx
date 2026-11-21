import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { CheckCircle, ShoeAvatar } from './billing-ui';
import type { BillingShoe } from './use-billing';

/** Selectable shoe tile used by Choose a plan and Add shoes. */
export function ShoeTile({
  dim = false,
  disabled = false,
  onPress,
  selected,
  shoe,
  subtitle,
}: {
  dim?: boolean;
  disabled?: boolean;
  onPress: () => void;
  selected: boolean;
  shoe: BillingShoe;
  subtitle: string;
}) {
  return (
    <Pressable
      accessibilityLabel={`${shoe.name}, ${subtitle}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.tile(selected), dim && styles.dim, pressed && styles.pressed]}
    >
      <View style={styles.check}>
        <CheckCircle checked={selected} size={20} />
      </View>
      <ShoeAvatar shoe={shoe} size={38} />
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.name}>{shoe.name}</Text>
        <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create(theme => ({
  tile: (selected: boolean) => ({
    flexBasis: '31%',
    flexGrow: 1,
    maxWidth: '33%',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: selected ? 5 : 6,
    paddingTop: selected ? 11 : 12,
    paddingBottom: selected ? 9 : 10,
    borderRadius: theme.radius.button,
    borderWidth: selected ? 2 : 1,
    borderColor: selected ? theme.colors.primaryGreen : theme.colors.chrome.cardBorder,
    backgroundColor: selected ? theme.colors.safeZone : theme.colors.surface,
  }),
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  copy: {
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  name: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.body,
    fontWeight: theme.typography.weight.semibold,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.overline,
    letterSpacing: 0,
    ...theme.typography.tabular,
  },
  dim: {
    opacity: 0.55,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
