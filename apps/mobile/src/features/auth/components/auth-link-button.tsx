import React from 'react';
import { Pressable, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

type AuthLinkButtonProps = {
  label: string;
  onPress: () => void;
};

export function AuthLinkButton({ label, onPress }: AuthLinkButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create(theme => ({
  button: {
    alignSelf: 'flex-start',
  },
  pressed: {
    opacity: 0.72,
  },
  label: {
    color: theme.colors.primaryGreen,
    fontFamily: theme.typography.family.body,
    fontSize: theme.typography.size.body,
    fontWeight: theme.typography.weight.semibold,
    lineHeight: 20,
  },
}));
