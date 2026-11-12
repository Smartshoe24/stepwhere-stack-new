import { useCameraPermissions } from "expo-camera";
import React from "react";
import { AppState, Linking } from "react-native";

export function useCameraPermissionState() {
  const [permission, requestPermission, refreshPermission] = useCameraPermissions();
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [isRequesting, setIsRequesting] = React.useState(false);
  const requestInFlightRef = React.useRef(false);

  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        return;
      }

      void refreshPermission().then(() => {
        setActionError(null);
      }).catch(() => {
        setActionError("Camera access could not be checked. Try again.");
      });
    });

    return () => {
      subscription.remove();
    };
  }, [refreshPermission]);

  const continueToPermissionRequest = React.useCallback(async () => {
    if (requestInFlightRef.current) {
      return;
    }

    requestInFlightRef.current = true;
    setIsRequesting(true);
    setActionError(null);

    try {
      await requestPermission();
    } catch {
      setActionError("Camera access could not be requested. Try again.");
    } finally {
      requestInFlightRef.current = false;
      setIsRequesting(false);
    }
  }, [requestPermission]);

  const openCameraSettings = React.useCallback(async () => {
    setActionError(null);

    try {
      await Linking.openSettings();
    } catch {
      setActionError("Open Settings manually to enable camera access.");
    }
  }, []);

  return {
    actionError,
    continueToPermissionRequest,
    isRequesting,
    openCameraSettings,
    permission,
  };
}
