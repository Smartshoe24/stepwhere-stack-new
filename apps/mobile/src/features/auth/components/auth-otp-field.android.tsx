import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export type AuthOtpFieldHandle = { focus: () => void };

type AuthOtpFieldProps = {
  autoFocus?: boolean;
  onChangeText: (value: string) => void;
  value: string;
};

export const AuthOtpField = forwardRef<AuthOtpFieldHandle, AuthOtpFieldProps>(function AuthOtpField({
  autoFocus = false,
  onChangeText,
  value,
}, ref) {
  const inputRef = useRef<TextInput | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const sanitizedValue = value.replace(/\D/g, '').slice(0, 6);

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  useEffect(() => {
    if (!autoFocus) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(timer);
  }, [autoFocus]);

  return (
    <View accessibilityLabel="Enter verification code" style={styles.container}>
      <TextInput
        autoComplete="sms-otp"
        caretHidden
        contextMenuHidden
        importantForAutofill="yes"
        inputMode="numeric"
        keyboardType="number-pad"
        maxLength={6}
        onBlur={() => setIsFocused(false)}
        onChangeText={(text) => onChangeText(text.replace(/\D/g, '').slice(0, 6))}
        onFocus={() => setIsFocused(true)}
        onPressIn={() => inputRef.current?.focus()}
        ref={inputRef}
        selectionColor="transparent"
        style={styles.inputOverlay}
        value={sanitizedValue}
      />
      <OtpBoxes focused={isFocused} value={sanitizedValue} />
    </View>
  );
});

function OtpBoxes({ focused, value }: { focused: boolean; value: string }) {
  return (
    <View pointerEvents="none" style={styles.row}>
      {Array.from({ length: 6 }).map((_, index) => {
        const digit = value[index] ?? '';
        const active = focused && index === Math.min(value.length, 5) && value.length < 6;
        return <View key={index} style={styles.box(active, Boolean(digit))}><Text style={styles.boxText}>{digit}</Text></View>;
      })}
    </View>
  );
}

const styles = StyleSheet.create(theme => ({
  container: { position: 'relative', minHeight: 50 },
  inputOverlay: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 2,
    opacity: 0.01, color: 'transparent',
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing[2] },
  box: (active: boolean, complete: boolean) => ({
    flex: 1, aspectRatio: 1, minHeight: 50, borderRadius: 16, borderWidth: 1,
    borderColor: active
      ? (theme.colors.background === '#000000' ? '#F7F4EF' : '#151313')
      : complete
        ? (theme.colors.background === '#000000' ? 'rgba(255,255,255,0.28)' : 'rgba(17,17,17,0.24)')
        : (theme.colors.background === '#000000' ? 'rgba(255,255,255,0.12)' : 'rgba(17,17,17,0.12)'),
    backgroundColor: theme.colors.background === '#000000' ? '#221F1F' : '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  }),
  boxText: {
    color: theme.colors.text, fontFamily: theme.typography.family.display,
    fontSize: 20, lineHeight: 24, fontWeight: theme.typography.weight.semibold,
  },
}));
