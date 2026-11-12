import type { PermissionResponse } from "expo-camera";
import React from "react";
import { Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { ShoeLoader } from "@/components/loading/shoe-loader";
import { AppIcon } from "@/components/ui/app-icon";
import { AuthPrimaryButton } from "@/features/auth/components/auth-primary-button";

type CameraPermissionStateProps = {
  actionError: string | null;
  deniedMessage: string;
  isRequesting: boolean;
  onContinue: () => void;
  onOpenSettings: () => void;
  permission: PermissionResponse | null;
  requestMessage: string;
};

export function CameraPermissionState({
  actionError,
  deniedMessage,
  isRequesting,
  onContinue,
  onOpenSettings,
  permission,
  requestMessage,
}: CameraPermissionStateProps) {
  const { theme } = useUnistyles();

  if (!permission) {
    return (
      <View accessibilityLabel="Checking camera access" style={styles.container}>
        <ShoeLoader size={48} />
        <Text style={styles.message}>Checking camera access…</Text>
      </View>
    );
  }

  const isPermanentlyDenied = !permission.granted && !permission.canAskAgain;

  return (
    <View style={styles.container}>
      <AppIcon color={theme.colors.primaryGreen} name="qrcode" size={28} />
      <Text style={styles.message}>
        {isPermanentlyDenied ? deniedMessage : requestMessage}
      </Text>
      {actionError ? (
        <Text accessibilityRole="alert" style={styles.error}>{actionError}</Text>
      ) : null}
      <View style={styles.action}>
        <AuthPrimaryButton
          accessibilityLabel={isPermanentlyDenied ? "Open camera settings" : "Continue to camera permission"}
          disabled={isRequesting}
          label={isPermanentlyDenied ? "Open Settings" : "Continue"}
          onPress={isPermanentlyDenied ? onOpenSettings : onContinue}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create(theme => ({
  container: {
    minHeight: 280,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[5],
    gap: theme.spacing[3],
    backgroundColor: theme.colors.surfaceMuted,
  },
  message: {
    ...theme.typography.text.bodyLarge,
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    textAlign: "center",
  },
  error: {
    ...theme.typography.text.body,
    color: theme.colors.alertText,
    fontFamily: theme.typography.family.body,
    textAlign: "center",
  },
  action: {
    minWidth: 148,
  },
}));
