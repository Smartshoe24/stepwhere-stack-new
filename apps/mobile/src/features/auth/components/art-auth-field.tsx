import React from 'react';
import { Text, TextInput, type TextInputProps, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

type ArtAuthFieldProps = {
  compact?: boolean;
  error?: string | null;
  label: string;
} & TextInputProps;

export function ArtAuthField({
  compact = false,
  error,
  label,
  ...inputProps
}: ArtAuthFieldProps) {
  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap(Boolean(error), compact)}>
        <TextInput
          autoCorrect={false}
          placeholderTextColor={styles.placeholder.color}
          style={styles.input}
          {...inputProps}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create(theme => ({
  block: {
    gap: theme.spacing[2],
  },
  label: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: theme.typography.weight.semibold,
  },
  inputWrap: (hasError: boolean, compact: boolean) => ({
    minHeight: compact ? 48 : 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: hasError
      ? theme.colors.alertBorder
      : (theme.colors.background === '#000000' ? 'rgba(255,255,255,0.12)' : 'rgba(17,17,17,0.12)'),
    backgroundColor: theme.colors.background === '#000000' ? '#221F1F' : '#FFFFFF',
    paddingHorizontal: theme.spacing[4],
    justifyContent: 'center',
  }),
  input: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: theme.typography.weight.medium,
    paddingVertical: 0,
  },
  placeholder: {
    color: theme.colors.textMuted,
  },
  error: {
    color: theme.colors.alertText,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: theme.typography.weight.medium,
  },
}));
