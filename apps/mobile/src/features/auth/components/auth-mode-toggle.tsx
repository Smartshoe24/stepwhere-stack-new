import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

type AuthMode = 'signin' | 'signup';

type AuthModeToggleProps = {
  onChange: (mode: AuthMode) => void;
  value: AuthMode;
};

const items: { label: string; value: AuthMode }[] = [
  { label: 'Sign in', value: 'signin' },
  { label: 'Sign up', value: 'signup' },
];

export function AuthModeToggle({
  onChange,
  value,
}: AuthModeToggleProps) {
  return (
    <View style={styles.container}>
      {items.map(item => {
        const active = item.value === value;

        return (
          <Pressable
            key={item.value}
            accessibilityRole="button"
            onPress={() => onChange(item.value)}
            style={({ pressed }) => [
              styles.item(active),
              pressed && styles.pressed,
            ]}>
            <Text style={styles.label(active)}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create(theme => ({
  container: {
    minHeight: 48,
    padding: 4,
    borderRadius: 999,
    flexDirection: 'row',
    backgroundColor: theme.colors.background === '#000000' ? '#221F1F' : '#EEE4DA',
  },
  item: (active: boolean) => ({
    flex: 1,
    minHeight: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: active
      ? (theme.colors.background === '#000000' ? '#F4EFE9' : '#151313')
      : 'transparent',
  }),
  pressed: {
    opacity: 0.86,
  },
  label: (active: boolean) => ({
    color: active
      ? (theme.colors.background === '#000000' ? '#151313' : '#FFFFFF')
      : theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: theme.typography.weight.semibold,
  }),
}));
