import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { StyleSheet } from 'react-native-unistyles';

type GoogleConnectButtonProps = {
  disabled?: boolean;
  error?: boolean;
  loading?: boolean;
  onPress: () => void;
  verifiedEmail?: string | null;
};

function GoogleMark() {
  return (
    <Svg height={20} viewBox="0 0 48 48" width={20}>
      <Path d="M44.5 20H24v8.5h11.8C34.7 34 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 3.2l6-6C34.5 4.8 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20.1-7.6 20.1-21 0-1.4-.1-2.7-.4-4z" fill="#FFC107" />
      <Path d="M6.3 14.1l7 5.1C15.2 14.4 19.3 11 24 11c3.1 0 5.9 1.1 8.1 3.2l6-6C34.5 4.8 29.6 3 24 3 16 3 9.1 7.5 5.6 14.1z" fill="#FF3D00" />
      <Path d="M24 45c5.5 0 10.1-1.8 13.6-4.9l-6.5-5.5C29.1 36.2 26.6 37 24 37c-6 0-10.6-3.1-12.3-7.8l-6.9 5.3C8.2 40.7 15.7 45 24 45z" fill="#4CAF50" />
      <Path d="M44.5 20H24v8.5h11.8c-.5 2.4-1.9 4.4-4.1 6.1l6.5 5.5c3.7-3.4 5.9-8.5 5.9-16.1 0-1.4-.1-2.7-.4-4z" fill="#1976D2" />
    </Svg>
  );
}

export function GoogleConnectButton({
  disabled = false,
  error = false,
  loading = false,
  onPress,
  verifiedEmail,
}: GoogleConnectButtonProps) {
  const isVerified = Boolean(verifiedEmail);
  const label = loading
    ? 'Connecting...'
    : isVerified
      ? 'Google email verified'
      : 'Continue with Google';

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button(error, isVerified, disabled || loading),
        pressed && !(disabled || loading) && styles.pressed,
      ]}
    >
      <View style={styles.mark}>
        <GoogleMark />
      </View>
      <View style={styles.copy}>
        <Text adjustsFontSizeToFit numberOfLines={1} style={styles.label}>
          {label}
        </Text>
        {verifiedEmail ? (
          <Text numberOfLines={1} style={styles.email}>
            {verifiedEmail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  button: (hasError: boolean, isVerified: boolean, isDisabled: boolean) => ({
    minHeight: 56,
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: hasError
      ? theme.colors.alertBorder
      : isVerified
        ? theme.colors.primaryGreen
        : theme.colors.chrome.cardBorder,
    backgroundColor: isDisabled ? theme.colors.surfaceMuted : theme.colors.surface,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[3],
  }),
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  email: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: theme.typography.weight.medium,
  },
  label: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: theme.typography.weight.semibold,
  },
  mark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
