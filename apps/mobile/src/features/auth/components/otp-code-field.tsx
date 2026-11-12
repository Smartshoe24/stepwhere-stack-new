import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

type OtpCodeFieldProps = {
  autoFocus?: boolean;
  length?: number;
  onChangeText: (value: string) => void;
  value: string;
  variant?: 'default' | 'editorial';
};

type OtpVariant = 'default' | 'editorial';

function getOtpBoxColors({
  isActive,
  isComplete,
  isDark,
  theme,
  variant,
}: {
  isActive: boolean;
  isComplete: boolean;
  isDark: boolean;
  theme: any;
  variant: OtpVariant;
}) {
  const borderColor = variant === 'editorial'
    ? (
      isActive
        ? (isDark ? '#F7F4EF' : '#151313')
        : isComplete
          ? (isDark ? 'rgba(255,255,255,0.32)' : 'rgba(17,17,17,0.3)')
          : (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(17,17,17,0.12)')
    )
    : (
      isActive
        ? theme.colors.primaryGreen
        : isComplete
          ? theme.colors.textSecondary
          : theme.colors.chrome.cardBorder
    );

  const backgroundColor = variant === 'editorial'
    ? (isDark ? '#221F1F' : '#FFFFFF')
    : (isComplete ? theme.colors.surface : theme.colors.surfaceMuted);

  return {
    backgroundColor,
    borderColor,
  };
}

export function OtpCodeField({
  autoFocus = true,
  length = 6,
  onChangeText,
  value,
  variant = 'default',
}: OtpCodeFieldProps) {
  const inputRef = useRef<TextInput | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const sanitizedValue = value.replace(/\D/g, '').slice(0, length);

  useEffect(() => {
    if (!autoFocus) {
      return;
    }

    const handle = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => cancelAnimationFrame(handle);
  }, [autoFocus]);

  function focusInput() {
    inputRef.current?.focus();
  }

  return (
    <Pressable
      accessibilityLabel="Enter verification code"
      accessibilityRole="button"
      onPress={focusInput}
      style={styles.container}>
      <TextInput
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        inputMode="numeric"
        keyboardType="number-pad"
        maxLength={length}
        onBlur={() => setIsFocused(false)}
        onChangeText={text => onChangeText(text.replace(/\D/g, '').slice(0, length))}
        onFocus={() => setIsFocused(true)}
        ref={inputRef}
        selectionColor="transparent"
        style={styles.hiddenInput}
        textContentType="oneTimeCode"
        value={sanitizedValue}
      />
      <View style={styles.boxRow}>
        {Array.from({ length }).map((_, index) => {
          const digit = sanitizedValue[index] ?? '';
          const isActive = isFocused && index === Math.min(sanitizedValue.length, length - 1) && sanitizedValue.length < length;
          const isComplete = digit.length > 0;

          return (
            <View
              key={index}
              style={styles.box(isActive, isComplete, variant)}>
              <Text style={styles.boxText}>{digit}</Text>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create(theme => ({
  container: {
    position: 'relative',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
  boxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing[2],
  },
  box: (isActive, isComplete, variant) => {
    const isDark = theme.colors.background === '#000000';
    const { backgroundColor, borderColor } = getOtpBoxColors({
      isActive,
      isComplete,
      isDark,
      theme,
      variant,
    });

    return {
      flex: 1,
      aspectRatio: 1,
      minHeight: 52,
      borderRadius: variant === 'editorial' ? 16 : theme.radius.cardSmall,
      borderWidth: 1,
      borderColor,
      backgroundColor,
      alignItems: 'center',
      justifyContent: 'center',
    };
  },
  boxText: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 20,
    fontWeight: theme.typography.weight.semibold,
    lineHeight: 24,
  },
}));
