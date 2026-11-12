import { CameraView } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AuthPrimaryButton } from '@/features/auth/components/auth-primary-button';
import { AuthTextField } from '@/features/auth/components/auth-text-field';
import { useAuth } from '@/features/auth/use-auth';
import { extractJoinToken } from '@/features/family/family-invite-link';
import { MinimalOnboardingScreen } from '@/features/onboarding/components/minimal-onboarding-screen';
import { ApiError, joinFamily, previewJoinFamilyToken } from '@/lib/api-client';
import { AppIcon } from '@/components/ui/app-icon';
import { CameraPermissionState } from '@/features/camera/camera-permission-state';
import { useCameraPermissionState } from '@/features/camera/use-camera-permission-state';

type JoinScanState =
  | 'scanning'
  | 'preview-loading'
  | 'preview-ready'
  | 'joining'
  | 'error';

function formatRemainingAt(expiresAt: string, now: number) {
  const remainingMs = new Date(expiresAt).getTime() - now;
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function JoinFamilyScreen() {
  const router = useRouter();
  const auth = useAuth();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const {
    actionError: cameraPermissionError,
    continueToPermissionRequest,
    isRequesting: isRequestingCameraPermission,
    openCameraSettings,
    permission,
  } = useCameraPermissionState();
  const [flashEnabled, setFlashEnabled] = React.useState(false);
  const [manualToken, setManualToken] = React.useState('');
  const [state, setState] = React.useState<JoinScanState>('scanning');
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<Awaited<ReturnType<typeof previewJoinFamilyToken>> | null>(null);
  const [activeToken, setActiveToken] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(() => Date.now());

  const tokenParam = typeof params.token === 'string' ? params.token : Array.isArray(params.token) ? params.token[0] : null;

  const loadPreview = React.useCallback(async (rawValue: string) => {
    const token = extractJoinToken(rawValue);

    if (!token) {
      setError('This is not a family invite QR.');
      setState('error');
      return;
    }

    setManualToken(token);
    setState('preview-loading');
    setError(null);
    setActiveToken(token);

    try {
      const result = await previewJoinFamilyToken(token, { operationName: 'previewJoinFamilyToken' });
      setPreview(result);
      setNow(Date.now());
      setState(result.isValid ? 'preview-ready' : 'error');
      if (!result.isValid) {
        setError('Invite expired. Ask the family admin to generate a new QR code.');
      }
    } catch (nextError) {
      if (nextError instanceof ApiError && nextError.code === 'ALREADY_IN_FAMILY') {
        setError('You are already in a family. Leave your current family before joining another.');
      } else {
        setError(nextError instanceof Error ? nextError.message : 'Could not check this invite.');
      }
      setState('error');
    }
  }, []);

  React.useEffect(() => {
    if (!tokenParam) {
      return;
    }

    const timeout = setTimeout(() => {
      void loadPreview(tokenParam);
    }, 0);

    return () => clearTimeout(timeout);
  }, [loadPreview, tokenParam]);

  React.useEffect(() => {
    if (state !== 'preview-ready' || !preview) {
      return;
    }

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [preview, state]);

  async function handleContinue() {
    if (!activeToken) {
      return;
    }

    setState('joining');
    setError(null);

    try {
      const result = await joinFamily({ token: activeToken });
      auth.applyProfilePatch({
        family: result.context,
        onboardingCompleted: true,
      });
      await auth.refreshSession();
      router.replace('/home');
    } catch (nextError) {
      if (nextError instanceof ApiError && nextError.code === 'ALREADY_IN_FAMILY') {
        setError('You are already in a family. Leave your current family before joining another.');
      } else if (nextError instanceof ApiError && nextError.code === 'INVITE_ALREADY_USED') {
        setError('This invite has already been used.');
      } else {
        setError(nextError instanceof Error ? nextError.message : 'Could not join this family.');
      }
      setState('error');
    }
  }

  const footer = state === 'preview-ready' || state === 'joining'
    ? (
      <View style={styles.footerButtons}>
        <AuthPrimaryButton
          disabled={state === 'joining'}
          icon="chevron-right"
          label={state === 'joining' ? 'Joining...' : 'Continue'}
          onPress={() => {
            void handleContinue();
          }}
        />
        <Pressable
          disabled={state === 'joining'}
          onPress={() => {
            setState('scanning');
            setPreview(null);
            setError(null);
            setActiveToken(null);
          }}
          style={({ pressed }) => [
            styles.scanAgainButton,
            state === 'joining' && styles.disabledButton,
            pressed && state !== 'joining' && styles.pressed,
          ]}
        >
          <Text style={styles.scanAgainLabel}>Scan another</Text>
        </Pressable>
      </View>
    )
    : null;

  return (
    <MinimalOnboardingScreen
      backHref="/onboarding/family"
      footer={footer}
      progressCurrent={2}
      progressTotal={4}
      subtitle="Ask the family admin to show their invite QR code."
      title="Scan family invite"
    >
      {state === 'scanning' || state === 'preview-loading' ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Invite QR</Text>
          <View style={styles.scannerShell}>
            {permission?.granted ? (
              <CameraView
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                enableTorch={flashEnabled}
                onBarcodeScanned={state === 'preview-loading' ? undefined : (event) => {
                  void loadPreview(event.data);
                }}
                style={styles.camera}
              />
            ) : (
              <CameraPermissionState
                actionError={cameraPermissionError}
                deniedMessage="Camera access is off. You can enter the invite code below or enable camera access in Settings."
                isRequesting={isRequestingCameraPermission}
                onContinue={() => { void continueToPermissionRequest(); }}
                onOpenSettings={() => { void openCameraSettings(); }}
                permission={permission}
                requestMessage="Use your camera to scan the family invite."
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
              <Pressable onPress={() => setFlashEnabled((current) => !current)} style={({ pressed }) => [styles.flashButton, pressed && styles.pressed]}>
                <AppIcon color={styles.flashIcon(flashEnabled).color} name={flashEnabled ? 'flash' : 'flash-off'} size={18} />
              </Pressable>
            ) : null}
          </View>
          {state === 'preview-loading' ? <Text style={styles.helperText}>Checking invite...</Text> : null}
        </View>
      ) : null}

      <View style={styles.manualBlock}>
        <AuthTextField
          autoCapitalize="none"
          label="Invite code"
          onChangeText={setManualToken}
          placeholder="Paste token or invite link"
          value={manualToken}
        />
        <AuthPrimaryButton
          disabled={state === 'joining' || state === 'preview-loading'}
          label="Preview invite"
          onPress={() => {
            void loadPreview(manualToken);
          }}
        />
      </View>

      {state === 'preview-ready' && preview ? (
        <View style={styles.previewCard}>
          <Text style={styles.previewTitle}>Join {preview.organization.familyName ?? preview.organization.name}</Text>
          <Text style={styles.previewSubtitle}>You will join as a family member.</Text>
          <Text style={styles.previewMeta}>Invite expires in {formatRemainingAt(preview.expiresAt, now)}</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBlock}>
          <Text style={styles.errorText}>{error}</Text>
          {error.includes('already in a family') ? (
            <Pressable onPress={() => router.replace('/profile')} style={({ pressed }) => [styles.scanAgainButton, pressed && styles.pressed]}>
              <Text style={styles.scanAgainLabel}>Go to profile</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => {
              setState('scanning');
              setError(null);
              setPreview(null);
              setActiveToken(null);
            }} style={({ pressed }) => [styles.scanAgainButton, pressed && styles.pressed]}>
              <Text style={styles.scanAgainLabel}>Scan again</Text>
            </Pressable>
          )}
        </View>
      ) : null}
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
    gap: theme.spacing[3],
  },
  helperText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
  },
  previewCard: {
    gap: theme.spacing[2],
    borderRadius: theme.radius.cardSmall,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing[4],
    ...theme.shadows.card,
  },
  previewTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: theme.typography.weight.semibold,
  },
  previewSubtitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 18,
  },
  previewMeta: {
    color: theme.colors.primaryGreen,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: theme.typography.weight.semibold,
  },
  errorBlock: {
    gap: theme.spacing[3],
  },
  errorText: {
    color: theme.colors.alertText,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
  },
  footerButtons: {
    gap: theme.spacing[3],
  },
  scanAgainButton: {
    minHeight: 42,
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  scanAgainLabel: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: theme.typography.weight.semibold,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
  disabledButton: {
    opacity: 0.6,
  },
}));
