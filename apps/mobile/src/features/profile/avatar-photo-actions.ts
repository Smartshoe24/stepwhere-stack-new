import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { Alert, Linking } from "react-native";

export type SelectedAvatar = {
  contentType: string;
  fileName: string;
  fileSize: number;
  uri: string;
};

export async function resolveFileSize(uri: string, fallback: number | null | undefined) {
  if (typeof fallback === "number" && fallback > 0) {
    return fallback;
  }

  const file = new File(uri);
  return file.size;
}

async function pickAvatar(source: "camera" | "library"): Promise<SelectedAvatar | null> {
  if (source === "camera") {
    const currentPermission = await ImagePicker.getCameraPermissionsAsync();

    if (!currentPermission.granted && !currentPermission.canAskAgain) {
      Alert.alert(
        "Camera access is off",
        "Enable camera access in Settings to take a new profile photo. You can still choose a photo from your library.",
        [
          { text: "Not now", style: "cancel" },
          {
            text: "Open Settings",
            onPress: () => {
              void Linking.openSettings().catch(() => {
                Alert.alert(
                  "Open Settings manually",
                  "Open the Settings app and enable Camera access for Stepwhere.",
                );
              });
            },
          },
        ],
      );
      return null;
    }

    const permissionResponse = currentPermission.granted
      ? currentPermission
      : await ImagePicker.requestCameraPermissionsAsync();

    if (!permissionResponse.granted) {
      return null;
    }
  }

  const result = source === "camera"
    ? await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    })
    : await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });

  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];

  if (!asset?.uri) {
    throw new Error("Failed to read the selected photo.");
  }

  return {
    uri: asset.uri,
    fileName: asset.fileName ?? `avatar-${Date.now()}.jpg`,
    fileSize: await resolveFileSize(asset.uri, asset.fileSize),
    contentType: asset.mimeType ?? "image/jpeg",
  };
}

export function pickAvatarFromCamera() {
  return pickAvatar("camera");
}

export function pickAvatarFromLibrary() {
  return pickAvatar("library");
}
