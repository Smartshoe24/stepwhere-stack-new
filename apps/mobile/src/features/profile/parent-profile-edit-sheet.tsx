import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native-unistyles';

import { AppIcon } from '@/components/ui/app-icon';
import { AuthPrimaryButton } from '@/features/auth/components/auth-primary-button';
import { GoogleConnectButton } from '@/features/auth/components/google-connect-button';
import { connectGoogleEmail } from '@/features/auth/google-connect';
import { AuthTextField } from '@/features/auth/components/auth-text-field';
import { useAuth } from '@/features/auth/use-auth';
import { createUserAvatarUploadIntent, uploadToSignedUrl } from '@/lib/api-client';
import { useUpdateProfileMutation } from '@/query/hooks';
import { DateOfBirthField } from '@/features/onboarding/components/date-of-birth-field';
import { AddressPlaceField } from './address-place-field';

import { pickAvatarFromCamera, pickAvatarFromLibrary, type SelectedAvatar } from './avatar-photo-actions';
import { AvatarPhotoField } from './avatar-photo-field';

type ParentProfileEditSheetProps = {
  initialValue: {
    avatarUrl: string | null;
    currentAddress: string | null;
    dateOfBirth: string | null;
    displayName: string;
    email: string | null;
  };
  onClose: () => void;
  visible: boolean;
};

function toIsoDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'P';
}

export function ParentProfileEditSheet(props: ParentProfileEditSheetProps) {
  const stateKey = `${props.visible ? 'open' : 'closed'}:${props.initialValue.displayName}:${props.initialValue.email ?? ''}:${props.initialValue.dateOfBirth ?? ''}:${props.initialValue.currentAddress ?? ''}:${props.initialValue.avatarUrl ?? ''}`;

  return (
    <Modal animationType="slide" onRequestClose={props.onClose} presentationStyle="overFullScreen" transparent visible={props.visible}>
      {props.visible ? <ParentProfileEditSheetBody key={stateKey} {...props} /> : null}
    </Modal>
  );
}

function ParentProfileEditSheetBody({
  initialValue,
  onClose,
}: Omit<ParentProfileEditSheetProps, 'visible'>) {
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const mutation = useUpdateProfileMutation();
  const [displayName, setDisplayName] = React.useState(initialValue.displayName);
  const [currentAddress, setCurrentAddress] = React.useState(initialValue.currentAddress ?? '');
  const [selectedDateOfBirth, setSelectedDateOfBirth] = React.useState<Date | null>(
    initialValue.dateOfBirth ? new Date(`${initialValue.dateOfBirth}T00:00:00.000Z`) : null,
  );
  const [selectedAvatar, setSelectedAvatar] = React.useState<SelectedAvatar | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = React.useState<string | null>(initialValue.avatarUrl);
  const [removeAvatar, setRemoveAvatar] = React.useState(false);
  const [isConnectingGoogle, setIsConnectingGoogle] = React.useState(false);
  const [googleError, setGoogleError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const trimmedDisplayName = displayName.trim();
  const trimmedAddress = currentAddress.trim();
  const avatarInitials = getInitials(trimmedDisplayName || initialValue.displayName);
  const verifiedEmail = auth.user?.emailVerified ? auth.user.email : null;

  async function handleAvatarPick(source: 'camera' | 'library') {
    try {
      const nextAvatar = source === 'camera'
        ? await pickAvatarFromCamera()
        : await pickAvatarFromLibrary();

      if (!nextAvatar) {
        return;
      }

      setSelectedAvatar(nextAvatar);
      setAvatarPreviewUrl(nextAvatar.uri);
      setRemoveAvatar(false);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to select the profile photo.');
    }
  }

  function handleRemoveAvatar() {
    setSelectedAvatar(null);
    setAvatarPreviewUrl(null);
    setRemoveAvatar(Boolean(initialValue.avatarUrl));
    setError(null);
  }

  async function handleConnectGoogle() {
    setIsConnectingGoogle(true);
    setGoogleError(null);
    setError(null);

    try {
      const profile = await connectGoogleEmail();
      auth.applyProfilePatch(profile);
      await auth.refreshSession();
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Failed to verify your Google email.';
      setGoogleError(message);
      setError(message);
    } finally {
      setIsConnectingGoogle(false);
    }
  }

  async function handleSave() {
    if (!trimmedDisplayName) {
      setError('Display name is required.');
      return;
    }

    if (selectedDateOfBirth && selectedDateOfBirth.getTime() > Date.now()) {
      setError('Date of birth cannot be in the future.');
      return;
    }

    setError(null);
    setGoogleError(null);

    try {
      let avatarUrl: string | null | undefined;

      if (selectedAvatar) {
        const uploadIntent = await createUserAvatarUploadIntent({
          fileName: selectedAvatar.fileName,
          contentType: selectedAvatar.contentType,
          fileSize: selectedAvatar.fileSize,
        });

        await uploadToSignedUrl({
          uri: selectedAvatar.uri,
          signedUrl: uploadIntent.signedUrl,
          contentType: selectedAvatar.contentType,
          fileName: selectedAvatar.fileName,
        });

        avatarUrl = uploadIntent.path;
      } else if (removeAvatar) {
        avatarUrl = null;
      }

      const profile = await mutation.mutateAsync({
        displayName: trimmedDisplayName,
        currentAddress: trimmedAddress ? trimmedAddress : null,
        dateOfBirth: toIsoDate(selectedDateOfBirth),
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      });

      auth.applyProfilePatch(profile);
      onClose();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to update the profile.');
    }
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <Pressable onPress={onClose} style={styles.scrim} />
      <View style={styles.sheet(Math.max(insets.bottom, 12))}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Edit profile</Text>
            <Text style={styles.subtitle}>Update your parent account details.</Text>
          </View>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
            <AppIcon color={styles.closeIcon.color} name="close" size={18} />
          </Pressable>
        </View>

        <View style={styles.fields}>
          <AvatarPhotoField
            actionsDisabled={mutation.isPending}
            backgroundColor={styles.avatarPreview.backgroundColor}
            helperText="Add or update your parent profile photo."
            imageUrl={avatarPreviewUrl}
            initials={avatarInitials}
            label="Profile photo"
            onCameraPress={() => {
              void handleAvatarPick('camera');
            }}
            onLibraryPress={() => {
              void handleAvatarPick('library');
            }}
            onRemovePress={avatarPreviewUrl ? handleRemoveAvatar : undefined}
          />
          <AuthTextField
            autoCapitalize="words"
            label="Display name"
            onChangeText={setDisplayName}
            placeholder="Parent name"
            value={displayName}
          />
          <DateOfBirthField
            defaultPickerDate={new Date('1990-01-01T00:00:00.000Z')}
            disabled={mutation.isPending}
            onChange={setSelectedDateOfBirth}
            value={selectedDateOfBirth}
          />
          <AddressPlaceField
            disabled={mutation.isPending}
            onChangeText={setCurrentAddress}
            value={currentAddress}
          />
          <GoogleConnectButton
            disabled={isConnectingGoogle}
            error={Boolean(googleError)}
            loading={isConnectingGoogle}
            onPress={() => {
              void handleConnectGoogle();
            }}
            verifiedEmail={verifiedEmail}
          />
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <AuthPrimaryButton
          disabled={mutation.isPending || isConnectingGoogle}
          label={mutation.isPending ? 'Saving...' : 'Save changes'}
          onPress={() => {
            void handleSave();
          }}
        />
      </View>
    </SafeAreaView>
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
    alignItems: 'flex-start',
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
  fields: {
    gap: theme.spacing[3],
  },
  avatarPreview: {
    backgroundColor: theme.colors.avatar.tones.blue,
  },
  dateField: {
    minHeight: 54,
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[3],
  },
  dateCopy: {
    flex: 1,
    gap: 2,
  },
  dateLabel: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
  },
  dateValue: (selectedDateOfBirth: Date | null) => ({
    color: selectedDateOfBirth ? theme.colors.text : theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: theme.typography.weight.medium,
  }),
  calendarIcon: {
    color: theme.colors.icon,
  },
  errorText: {
    color: theme.colors.alertText,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: theme.typography.weight.medium,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
