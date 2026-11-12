import React from 'react';
import { Text, TextInput, type TextInputProps, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

type AuthTextFieldProps = {
  description?: string;
  error?: string | null;
  label: string;
} & TextInputProps;

export function AuthTextField({
  description,
  error,
  label,
  ...inputProps
}: AuthTextFieldProps) {
  const isMultiline = Boolean(inputProps.multiline);

  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap(Boolean(error), isMultiline)}>
        <TextInput
          multiline={inputProps.multiline}
          placeholderTextColor={styles.placeholder.color}
          style={styles.input(isMultiline)}
          {...inputProps}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!error && description ? <Text style={styles.description}>{description}</Text> : null}
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
  inputWrap: (hasError: boolean, isMultiline: boolean) => ({
    minHeight: isMultiline ? 104 : 54,
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: hasError ? theme.colors.alertBorder : theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: isMultiline ? theme.spacing[3] : 0,
    justifyContent: isMultiline ? 'flex-start' : 'center',
  }),
  input: (isMultiline: boolean) => ({
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 15,
    fontWeight: theme.typography.weight.medium,
    paddingVertical: 0,
    textAlignVertical: isMultiline ? 'top' : 'center',
    minHeight: isMultiline ? 64 : undefined,
  }),
  placeholder: {
    color: theme.colors.textMuted,
  },
  description: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
  },
  error: {
    color: theme.colors.alertText,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: theme.typography.weight.medium,
  },
}));
