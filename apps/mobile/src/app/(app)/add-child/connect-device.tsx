import { CameraView } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AppIcon } from '@/components/ui/app-icon';
import { AuthPrimaryButton } from '@/features/auth/components/auth-primary-button';
import { AuthTextField } from '@/features/auth/components/auth-text-field';
import { clearAddChildDraft, getAddChildDraft, updateAddChildDraft } from '@/features/children/add-child-draft';
import { normalizeDeviceId } from '@/features/children/add-child-utils';
import { MinimalOnboardingScreen } from '@/features/onboarding/components/minimal-onboarding-screen';
import { CameraPermissionState } from '@/features/camera/camera-permission-state';
import { useCameraPermissionState } from '@/features/camera/use-camera-permission-state';
import { ApiError, releaseDeviceReservation, reserveDevice } from '@/lib/api-client';
import { useAuth } from '@/features/auth/use-auth';

export default function AddChildConnectDeviceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const returnTo = params.returnTo === 'profile' ? 'profile' : 'home';
  const auth = useAuth();
  const canManageChildren = Boolean(auth.user?.family.permissions.canManageChildren);
  const {
    actionError: cameraPermissionError,
    continueToPermissionRequest,
    isRequesting: isRequestingCameraPermission,
    openCameraSettings,
    permission,
  } = useCameraPermissionState();
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [manualDeviceId, setManualDeviceId] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isReserving, setIsReserving] = useState(false);
  const [isScannerPaused, setIsScannerPaused] = useState(false);

  useEffect(() => {
    if (!canManageChildren) {
      router.replace('/home');
    }
  }, [canManageChildren, router]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateDraft() {
      const draft = await getAddChildDraft();

      if (cancelled) {
        return;
      }

      if (draft.reservation && new Date(draft.reservation.expiresAt) > new Date()) {
        setManualDeviceId(draft.reservation.hardwareIdentifier);
      } else if (draft.reservation) {
        await updateAddChildDraft({ reservation: null });
      }
    }

    void hydrateDraft();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleReserveDevice(rawDeviceId: string) {
    const hardwareIdentifier = normalizeDeviceId(rawDeviceId);

    if (!hardwareIdentifier) {
      setSubmitError('Enter or scan a valid Shoe ID.');
      return;
    }

    setIsReserving(true);
    setSubmitError(null);
    setIsScannerPaused(true);

    try {
      const reservation = await reserveDevice({ hardwareIdentifier });
      await updateAddChildDraft({ reservation });
      router.replace(`/add-child/details?returnTo=${returnTo}` as never);
    } catch (error) {
      if (error instanceof ApiError) {
        setSubmitError(error.message);
      } else {
        setSubmitError(error instanceof Error ? error.message : 'Failed to connect this shoe.');
      }
      setIsScannerPaused(false);
    } finally {
      setIsReserving(false);
    }
  }

  return (
    <MinimalOnboardingScreen
      backHref={`/${returnTo}`}
      footer={(
        <AuthPrimaryButton
          disabled={isReserving}
          icon="chevron-right"
          label={isReserving ? 'Checking...' : 'Continue'}
          onPress={() => {
            void handleReserveDevice(manualDeviceId);
          }}
        />
      )}
      progressCurrent={1}
      progressTotal={2}
      title="Connect shoe">
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Scan shoe QR</Text>
        <View style={styles.scannerShell}>
          {permission?.granted ? (
            <CameraView
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              enableTorch={flashEnabled}
              onBarcodeScanned={isScannerPaused || isReserving ? undefined : (event) => {
                setManualDeviceId(normalizeDeviceId(event.data));
                void handleReserveDevice(event.data);
              }}
              style={styles.camera}
            />
          ) : (
            <CameraPermissionState
              actionError={cameraPermissionError}
              deniedMessage="Camera access is off. You can enter the Shoe ID below or enable camera access in Settings."
              isRequesting={isRequestingCameraPermission}
              onContinue={() => { void continueToPermissionRequest(); }}
              onOpenSettings={() => { void openCameraSettings(); }}
              permission={permission}
              requestMessage="Use your camera to scan the shoe QR code."
            />
          )}
          <View pointerEvents="none" style={styles.scanFrame}>
            <View style={styles.frameTopRow}>
              <View style={[styles.frameCorner, styles.frameTopLeft]} />
              <View style={[styles.frameCorner, styles.frameTopRight]} />
            </View>
            <View style={styles.frameBottomRow}>
              <View style={[styles.frameCorner, styles.frameBottomLeft]} />
              <View style={[styles.frameCorner, styles.frameBottomRight]} />
            </View>
          </View>
          {permission?.granted ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setFlashEnabled((current) => !current)}
              style={({ pressed }) => [styles.flashButton, pressed && styles.pressed]}>
              <AppIcon
                color={styles.flashIcon(flashEnabled).color}
                name={flashEnabled ? 'flash' : 'flash-off'}
                size={18}
              />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.manualBlock}>
        <AuthTextField
          autoCapitalize="characters"
          label="Shoe ID"
          onChangeText={(value) => {
            setManualDeviceId(normalizeDeviceId(value));
            if (submitError) {
              setSubmitError(null);
            }
          }}
          placeholder="SW-DEV-0001"
          value={manualDeviceId}
        />
        <Text style={styles.helperText}>Use the code printed on the box if scanning is not available.</Text>
      </View>

      {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void (async () => {
            try {
              await releaseDeviceReservation();
            } finally {
              await clearAddChildDraft();
              setManualDeviceId('');
              setIsScannerPaused(false);
              setSubmitError(null);
            }
          })();
        }}
        style={({ pressed }) => pressed && styles.pressed}>
        <Text style={styles.resetText}>Clear current shoe</Text>
      </Pressable>
    </MinimalOnboardingScreen>
  );
}

const styles = StyleSheet.create(theme => ({
  section: {
    gap: theme.spacing[2],
  },
  sectionLabel: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: theme.typography.weight.semibold,
  },
  scannerShell: {
    position: 'relative',
    minHeight: 280,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  camera: {
    minHeight: 280,
  },
  scanFrame: {
    position: 'absolute',
    inset: 20,
    justifyContent: 'space-between',
  },
  frameTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  frameBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  frameCorner: {
    width: 34,
    height: 34,
    borderColor: '#F5CF8E',
  },
  frameTopLeft: {
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 14,
  },
  frameTopRight: {
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 14,
  },
  frameBottomLeft: {
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 14,
  },
  frameBottomRight: {
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 14,
  },
  flashButton: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 36,
    height: 36,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.68)',
  },
  flashIcon: (enabled: boolean) => ({
    color: enabled ? '#F5CF8E' : '#FFFFFF',
  }),
  manualBlock: {
    gap: theme.spacing[2],
  },
  helperText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
  },
  errorText: {
    color: theme.colors.alertText,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: theme.typography.weight.medium,
  },
  resetText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 16,
    textAlign: 'center',
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
