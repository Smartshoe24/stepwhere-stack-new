import React from 'react';
import { Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

type PhoneNumberFieldProps = {
  error?: string | null;
  label?: string;
  onChangeText: (value: string) => void;
  value: string;
};

export function PhoneNumberField({
  error,
  label = 'Phone number',
  onChangeText,
  value,
}: PhoneNumberFieldProps) {
  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row(Boolean(error))}>
        <View style={styles.prefix}>
          <Text style={styles.prefixText}>+91</Text>
        </View>
        <View style={styles.divider} />
        <TextInput
          inputMode="numeric"
          keyboardType="number-pad"
          maxLength={10}
          onChangeText={onChangeText}
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
    fontSize: 13,
    fontWeight: theme.typography.weight.semibold,
    lineHeight: 16,
  },
  row: (hasError: boolean) => ({
    minHeight: 54,
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: hasError ? theme.colors.alertBorder : theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
  }),
  prefix: {
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefixText: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 15,
    fontWeight: theme.typography.weight.medium,
  },
  divider: {
    width: 1,
    height: 22,
    backgroundColor: theme.colors.chrome.cardBorder,
    marginHorizontal: theme.spacing[2],
  },
  input: {
    flex: 1,
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 15,
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
