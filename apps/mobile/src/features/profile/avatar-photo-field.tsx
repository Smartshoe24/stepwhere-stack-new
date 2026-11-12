import React from "react";
import {
  ActionSheetIOS,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import { Avatar } from "@/components/ui/avatar";
import { AppIcon } from "@/components/ui/app-icon";

type AvatarPhotoFieldProps = {
  actionsDisabled?: boolean;
  backgroundColor: string;
  error?: string | null;
  helperText?: string;
  imageUrl: string | null;
  initials: string;
  label: string;
  onCameraPress: () => void;
  onLibraryPress: () => void;
  onRemovePress?: () => void;
};

type PhotoAction = {
  destructive?: boolean;
  icon: "camera" | "image" | "trash";
  label: string;
  onPress: () => void;
};

export function AvatarPhotoField({
  actionsDisabled = false,
  backgroundColor,
  error = null,
  helperText,
  imageUrl,
  initials,
  label,
  onCameraPress,
  onLibraryPress,
  onRemovePress,
}: AvatarPhotoFieldProps) {
  const [androidSheetVisible, setAndroidSheetVisible] = React.useState(false);
  const actions: PhotoAction[] = [
    { icon: "camera", label: "Take Photo", onPress: onCameraPress },
    { icon: "image", label: "Choose from Library", onPress: onLibraryPress },
    ...(onRemovePress
      ? [{ destructive: true, icon: "trash" as const, label: "Remove Photo", onPress: onRemovePress }]
      : []),
  ];

  function openActions() {
    if (actionsDisabled) {
      return;
    }

    if (Platform.OS === "ios") {
      const options = [...actions.map((action) => action.label), "Cancel"];
      ActionSheetIOS.showActionSheetWithOptions({
        options,
        cancelButtonIndex: options.length - 1,
        destructiveButtonIndex: onRemovePress ? actions.length - 1 : undefined,
        title: label,
      }, (index) => {
        actions[index]?.onPress();
      });
      return;
    }

    setAndroidSheetVisible(true);
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.row}>
        <Pressable
          accessibilityLabel={`${imageUrl ? "Change" : "Add"} ${label.toLowerCase()}`}
          accessibilityRole="button"
          disabled={actionsDisabled}
          onPress={openActions}
          style={({ pressed }) => [
            styles.avatarButton,
            actionsDisabled && styles.disabled,
            pressed && !actionsDisabled && styles.pressed,
          ]}
        >
          <Avatar
            backgroundColor={backgroundColor}
            imageUrl={imageUrl}
            initials={initials}
            size={88}
            textSize={24}
          />
          <View style={styles.editBadge}>
            <AppIcon color={styles.editIcon.color} name={imageUrl ? "pencil" : "camera"} size={15} />
          </View>
        </Pressable>
        <View style={styles.copy}>
          <Text style={styles.actionTitle}>{imageUrl ? "Tap to change photo" : "Tap to add a photo"}</Text>
          {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
          {onRemovePress ? <Text style={styles.removeHint}>Remove Photo is available from the photo menu.</Text> : null}
        </View>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <AndroidPhotoActionSheet
        actions={actions}
        onClose={() => setAndroidSheetVisible(false)}
        title={label}
        visible={androidSheetVisible}
      />
    </View>
  );
}

function AndroidPhotoActionSheet({
  actions,
  onClose,
  title,
  visible,
}: {
  actions: PhotoAction[];
  onClose: () => void;
  title: string;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();

  if (Platform.OS === "ios") {
    return null;
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="overFullScreen" transparent visible={visible}>
      <SafeAreaView edges={["bottom"]} style={styles.sheetSafeArea}>
        <Pressable accessibilityLabel="Close photo menu" onPress={onClose} style={styles.scrim} />
        <View style={styles.sheet(Math.max(insets.bottom, 12))}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{title}</Text>
          <View style={styles.actionList}>
            {actions.map((action) => (
              <Pressable
                accessibilityRole="button"
                key={action.label}
                onPress={() => {
                  onClose();
                  action.onPress();
                }}
                style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
              >
                <View style={styles.actionIconPlate(action.destructive)}>
                  <AppIcon
                    color={action.destructive ? styles.destructiveIcon.color : styles.actionIcon.color}
                    name={action.icon}
                    size={18}
                  />
                </View>
                <Text style={styles.actionLabel(action.destructive)}>{action.label}</Text>
              </Pressable>
            ))}
            <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.cancelRow, pressed && styles.pressed]}>
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: { gap: theme.spacing[2] },
  sectionLabel: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: theme.typography.weight.semibold,
  },
  row: { flexDirection: "row", alignItems: "center", gap: theme.spacing[4] },
  avatarButton: { width: 96, height: 96, alignItems: "center", justifyContent: "center" },
  editBadge: {
    position: "absolute",
    right: 0,
    bottom: 2,
    width: 32,
    height: 32,
    borderRadius: theme.radius.circle,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: theme.colors.surface,
    backgroundColor: theme.colors.primaryGreen,
    ...theme.shadows.card,
  },
  editIcon: { color: "#FFFFFF" },
  copy: { flex: 1, gap: 4 },
  actionTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: theme.typography.weight.semibold,
  },
  helperText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
  },
  removeHint: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    fontSize: 11,
    lineHeight: 15,
  },
  errorText: {
    color: theme.colors.alertText,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: theme.typography.weight.medium,
  },
  disabled: { opacity: 0.55 },
  pressed: { opacity: theme.colors.button.pressedOpacity },
  sheetSafeArea: { flex: 1, justifyContent: "flex-end" },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.shadowStrong,
    opacity: 0.32,
  },
  sheet: (bottomInset: number) => ({
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    borderTopLeftRadius: theme.radius.card,
    borderTopRightRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
    paddingBottom: bottomInset + theme.spacing[3],
    gap: theme.spacing[3],
    ...theme.shadows.floating,
  }),
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.chrome.cardBorder,
    alignSelf: "center",
  },
  sheetTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: theme.typography.weight.semibold,
  },
  actionList: { gap: 2 },
  actionRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  actionIconPlate: (destructive?: boolean) => ({
    width: 36,
    height: 36,
    borderRadius: theme.radius.circle,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: destructive ? theme.colors.alertBackground : theme.colors.surfaceMuted,
  }),
  actionIcon: { color: theme.colors.primaryGreen },
  destructiveIcon: { color: theme.colors.alertText },
  actionLabel: (destructive?: boolean) => ({
    color: destructive ? theme.colors.alertText : theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: theme.typography.weight.medium,
  }),
  cancelRow: {
    minHeight: 48,
    marginTop: theme.spacing[2],
    borderRadius: theme.radius.button,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceMuted,
  },
  cancelLabel: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 14,
    fontWeight: theme.typography.weight.semibold,
  },
}));
