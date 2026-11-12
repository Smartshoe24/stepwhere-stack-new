import React from 'react';
import { Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

type ArtAuthPhoneFieldProps = {
  compact?: boolean;
  error?: string | null;
  onBlur?: () => void;
  onChangeText: (value: string) => void;
  onFocus?: () => void;
  value: string;
};

export function ArtAuthPhoneField({
  compact = false,
  error,
  onBlur,
  onChangeText,
  onFocus,
  value,
}: ArtAuthPhoneFieldProps) {
  return (
    <View style={styles.block}>
      <Text style={styles.label}>Phone</Text>
      <View style={styles.row(Boolean(error), compact)}>
        <View style={styles.prefixWrap}>
          <Text style={styles.prefixText}>+91</Text>
        </View>
        <View style={styles.divider} />
        <TextInput
          inputMode="numeric"
          keyboardType="number-pad"
          maxLength={10}
          onBlur={onBlur}
          onChangeText={onChangeText}
          onFocus={onFocus}
          placeholder="98765 43210"
          placeholderTextColor={styles.placeholder.color}
          style={styles.input}
          value={value}
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
  row: (hasError: boolean, compact: boolean) => ({
    minHeight: compact ? 48 : 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: hasError
      ? theme.colors.alertBorder
      : (theme.colors.background === '#000000' ? 'rgba(255,255,255,0.12)' : 'rgba(17,17,17,0.12)'),
    backgroundColor: theme.colors.background === '#000000' ? '#221F1F' : '#FFFFFF',
    paddingHorizontal: theme.spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
  }),
  prefixWrap: {
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefixText: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: theme.typography.weight.medium,
  },
  divider: {
    width: 1,
    height: 22,
    marginHorizontal: theme.spacing[2],
    backgroundColor: theme.colors.background === '#000000' ? 'rgba(255,255,255,0.12)' : 'rgba(17,17,17,0.12)',
  },
  input: {
    flex: 1,
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
