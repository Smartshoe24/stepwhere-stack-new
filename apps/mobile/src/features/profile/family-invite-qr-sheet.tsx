import React from 'react';
import * as Clipboard from 'expo-clipboard';
import { ActivityIndicator, Modal, Platform, Pressable, Share, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native-unistyles';

import type { FamilyQrInviteDto } from '@stepwhere/types';

import { AppIcon } from '@/components/ui/app-icon';
import { useCreateFamilyQrInviteMutation } from '@/query/hooks';

type FamilyInviteQrSheetProps = {
  familyName: string;
  onClose: () => void;
  visible: boolean;
};

function formatRemaining(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function FamilyInviteQrSheetBody({ familyName, onClose }: Omit<FamilyInviteQrSheetProps, 'visible'>) {
  const insets = useSafeAreaInsets();
  const { isPending, mutateAsync } = useCreateFamilyQrInviteMutation();
  const [invite, setInvite] = React.useState<FamilyQrInviteDto | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const hasRequestedInitialInvite = React.useRef(false);

  const remainingSeconds = invite
    ? Math.max(0, Math.ceil((new Date(invite.expiresAt).getTime() - now) / 1000))
    : 0;
  const expired = Boolean(invite) && remainingSeconds <= 0;
  const progress = invite ? Math.max(0, remainingSeconds / (15 * 60)) : 0;
  const inviteLink = invite?.joinUrl ?? null;
  const shareDisabled = isPending || !inviteLink || expired;

  async function handleCreateInvite() {
    setError(null);
    setStatusMessage(null);

    try {
      const nextInvite = await mutateAsync();
      setInvite(nextInvite);
      setNow(Date.now());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to create an invite.');
    }
  }

  async function handleShare() {
    if (!inviteLink || shareDisabled) {
      return;
    }

    setStatusMessage(null);

    try {
      const intro = `Join ${familyName} on StepWhere. This invite expires in ${formatRemaining(remainingSeconds)}.`;
      await Share.share(Platform.OS === 'ios'
        ? {
            title: 'StepWhere family invite',
            message: intro,
            url: inviteLink,
          }
        : {
            title: 'StepWhere family invite',
            message: `${intro}\n${inviteLink}`,
          });
    } catch {
      setStatusMessage('Could not share invite. Try again.');
    }
  }

  async function handleCopyLink() {
    if (!inviteLink || shareDisabled) {
      return;
    }

    try {
      await Clipboard.setStringAsync(inviteLink);
      setStatusMessage('Invite link copied.');
    } catch {
      setStatusMessage('Could not copy invite link.');
    }
  }

  React.useEffect(() => {
    if (hasRequestedInitialInvite.current) {
      return;
    }

    hasRequestedInitialInvite.current = true;
    let cancelled = false;

    const timeout = setTimeout(async () => {
      setError(null);

      try {
        const nextInvite = await mutateAsync();

        if (!cancelled) {
          setInvite(nextInvite);
          setNow(Date.now());
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to create an invite.');
        }
      }
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [mutateAsync]);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    if (!statusMessage) {
      return;
    }

    const timeout = setTimeout(() => setStatusMessage(null), 2200);
    return () => clearTimeout(timeout);
  }, [statusMessage]);

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <Pressable onPress={onClose} style={styles.scrim} />
      <View style={styles.sheet(Math.max(insets.bottom, 12))}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Invite member</Text>
            <Text style={styles.subtitle}>Ask them to sign in, tap Join a family, and scan this code.</Text>
          </View>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
            <AppIcon color={styles.closeIcon.color} name="close" size={18} />
          </Pressable>
        </View>

        <View style={styles.familyChip}>
          <Text style={styles.familyChipTitle}>{familyName} family</Text>
          <Text style={styles.familyChipLabel}>Member</Text>
        </View>

        <View style={styles.qrCard}>
          {isPending && !invite ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={styles.spinner.color} size="large" />
              <Text style={styles.loadingText}>Creating invite...</Text>
            </View>
          ) : error ? (
            <View style={styles.loadingState}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable disabled={isPending} onPress={() => { void handleCreateInvite(); }} style={({ pressed }) => [styles.retryButton, isPending && styles.disabledButton, pressed && !isPending && styles.pressed]}>
                <Text style={styles.retryLabel}>{isPending ? 'Generating...' : 'Try again'}</Text>
              </Pressable>
            </View>
          ) : invite ? (
            <View style={styles.qrState}>
              <View style={styles.qrActionsRow}>
                <Pressable
                  accessibilityLabel="Share invite link"
                  disabled={shareDisabled}
                  onPress={() => { void handleShare(); }}
                  style={({ pressed }) => [
                    styles.qrActionIconButton,
                    shareDisabled && styles.disabledButton,
                    pressed && !shareDisabled && styles.pressed,
                  ]}
                >
                  <AppIcon color={styles.qrActionIcon.color} name="share" size={16} />
                </Pressable>
              </View>
              <View style={styles.qrSurface(expired)}>
                <QRCode size={220} value={inviteLink ?? ''} />
                {expired ? (
                  <View style={styles.expiredOverlay}>
                    <Text style={styles.expiredLabel}>Invite expired</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.timer(expired, remainingSeconds <= 60)}>{expired ? 'Invite expired' : `Expires in ${formatRemaining(remainingSeconds)}`}</Text>
              <View style={styles.progressTrack}>
                <View style={styles.progressFill(progress, remainingSeconds <= 60)} />
              </View>
              <Pressable
                disabled={shareDisabled}
                onPress={() => { void handleCopyLink(); }}
                style={({ pressed }) => [
                  styles.linkAction,
                  shareDisabled && styles.disabledButton,
                  pressed && !shareDisabled && styles.pressed,
                ]}
              >
                <AppIcon color={styles.linkActionIcon.color} name="copy" size={16} />
                <Text style={styles.linkActionLabel}>Copy link</Text>
              </Pressable>
              {statusMessage ? <Text style={styles.statusMessage}>{statusMessage}</Text> : null}
            </View>
          ) : null}
        </View>

        <View style={styles.footer}>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text style={styles.secondaryButtonLabel}>Close</Text>
          </Pressable>
          {expired ? (
            <Pressable disabled={isPending} onPress={() => { void handleCreateInvite(); }} style={({ pressed }) => [styles.primaryButton, isPending && styles.disabledButton, pressed && !isPending && styles.pressed]}>
              <Text style={styles.primaryButtonLabel}>{isPending ? 'Generating...' : 'Generate new QR'}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

export function FamilyInviteQrSheet(props: FamilyInviteQrSheetProps) {
  return (
    <Modal animationType="slide" onRequestClose={props.onClose} presentationStyle="overFullScreen" transparent visible={props.visible}>
      {props.visible ? <FamilyInviteQrSheetBody {...props} /> : null}
    </Modal>
  );
}

const styles = StyleSheet.create((theme) => ({
  safeArea: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.shadowStrong,
    opacity: 0.32,
  },
  sheet: (bottomInset: number) => ({
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    borderTopLeftRadius: theme.radius.card,
    borderTopRightRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing[5],
    paddingTop: theme.spacing[5],
    paddingBottom: bottomInset + theme.spacing[4],
    gap: theme.spacing[4],
    ...theme.shadows.floating,
  }),
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing[3],
  },
  headerCopy: {
    flex: 1,
    gap: theme.spacing[1],
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: theme.typography.weight.bold,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 18,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceMuted,
  },
  closeIcon: {
    color: theme.colors.icon,
  },
  familyChip: {
    alignSelf: 'flex-start',
    gap: 2,
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
  },
  familyChipTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: theme.typography.weight.medium,
  },
  familyChipLabel: {
    color: theme.colors.primaryGreen,
    fontFamily: theme.typography.family.body,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: theme.typography.weight.semibold,
    textTransform: 'uppercase',
  },
  qrCard: {
    borderRadius: theme.radius.cardSmall,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing[4],
  },
  loadingState: {
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[3],
  },
  spinner: {
    color: theme.colors.primaryGreen,
  },
  loadingText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 18,
  },
  qrState: {
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  qrActionsRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  qrActionIconButton: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
  },
  qrActionIcon: {
    color: theme.colors.button.icon,
  },
  qrSurface: (expired: boolean) => ({
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 18,
    opacity: expired ? 0.5 : 1,
  }),
  expiredOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expiredLabel: {
    color: '#172033',
    fontFamily: theme.typography.family.display,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: theme.typography.weight.bold,
  },
  timer: (expired: boolean, warning: boolean) => ({
    color: expired ? theme.colors.textMuted : warning ? theme.colors.alertText : theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: theme.typography.weight.medium,
  }),
  progressTrack: {
    width: '100%',
    height: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.chrome.cardBorder,
    overflow: 'hidden',
  },
  progressFill: (progress: number, warning: boolean) => ({
    width: `${Math.max(0, Math.min(progress, 1)) * 100}%`,
    height: '100%',
    borderRadius: 999,
    backgroundColor: warning ? theme.colors.alertBorder : theme.colors.primaryGreen,
  }),
  linkAction: {
    minHeight: 40,
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
  },
  linkActionIcon: {
    color: theme.colors.button.icon,
  },
  linkActionLabel: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: theme.typography.weight.semibold,
  },
  statusMessage: {
    color: theme.colors.primaryGreen,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  errorText: {
    color: theme.colors.alertText,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 42,
    borderRadius: theme.radius.button,
    backgroundColor: theme.colors.primaryGreen,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing[4],
  },
  disabledButton: {
    opacity: 0.6,
  },
  retryLabel: {
    color: '#FFFFFF',
    fontFamily: theme.typography.family.display,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: theme.typography.weight.semibold,
  },
  footer: {
    flexDirection: 'row',
    gap: theme.spacing[3],
  },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  secondaryButtonLabel: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: theme.typography.weight.semibold,
  },
  primaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: theme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primaryGreen,
  },
  primaryButtonLabel: {
    color: '#FFFFFF',
    fontFamily: theme.typography.family.display,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: theme.typography.weight.semibold,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
