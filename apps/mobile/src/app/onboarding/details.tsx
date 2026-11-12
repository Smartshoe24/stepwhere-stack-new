import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { GoogleConnectButton } from '@/features/auth/components/google-connect-button';
import { connectGoogleEmail } from '@/features/auth/google-connect';
import { AuthPrimaryButton } from '@/features/auth/components/auth-primary-button';
import { AuthTextField } from '@/features/auth/components/auth-text-field';
import { useAuth } from '@/features/auth/use-auth';
import { MinimalOnboardingScreen } from '@/features/onboarding/components/minimal-onboarding-screen';
import { DateOfBirthField } from '@/features/onboarding/components/date-of-birth-field';
import { getParentDetailsDraft, updateParentDetailsDraft } from '@/features/onboarding/parent-details-draft';
import {
  getParentNameInputValue,
  isMeaningfulParentName,
} from '@/features/onboarding/parent-profile-readiness';
import { AddressPlaceField } from '@/features/profile/address-place-field';
import { AvatarPhotoField } from '@/features/profile/avatar-photo-field';
import { pickAvatarFromCamera, pickAvatarFromLibrary, type SelectedAvatar } from '@/features/profile/avatar-photo-actions';
import { createUserAvatarUploadIntent, updateMe, uploadToSignedUrl } from '@/lib/api-client';

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'P';
}

export default function OnboardingDetailsScreen() {
  const router = useRouter();
  const auth = useAuth();
  const [fullName, setFullName] = useState(() => getParentNameInputValue(
    auth.user?.displayName,
    auth.user?.phoneNumber,
  ));
  const [currentAddress, setCurrentAddress] = useState(auth.user?.currentAddress ?? '');
  const [dateOfBirth, setDateOfBirth] = useState<Date | null>(
    auth.user?.dateOfBirth ? new Date(`${auth.user.dateOfBirth}T00:00:00.000Z`) : null,
  );
  const [selectedAvatar, setSelectedAvatar] = useState<SelectedAvatar | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(auth.user?.avatarUrl ?? null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [errors, setErrors] = useState<{
    currentAddress?: string;
    dateOfBirth?: string;
    google?: string;
    fullName?: string;
  }>({});
  const hydratedUserIdRef = React.useRef<string | null>(null);
  const avatarInitials = getInitials(
    fullName
      || getParentNameInputValue(auth.user?.displayName, auth.user?.phoneNumber)
      || 'Parent',
  );
  const verifiedEmail = auth.user?.emailVerified ? auth.user.email : null;

  useEffect(() => {
    const user = auth.user;
    if (!user) {
      hydratedUserIdRef.current = null;
      return;
    }

    if (hydratedUserIdRef.current === user.id) {
      return;
    }

    hydratedUserIdRef.current = user.id;

    let cancelled = false;
    void getParentDetailsDraft(user.id).then((draft) => {
      if (cancelled) {
        return;
      }

      setFullName(getParentNameInputValue(
        draft.fullName ?? user.displayName,
        user.phoneNumber,
      ));
      setCurrentAddress(draft.currentAddress ?? user.currentAddress ?? '');
      const dateValue = draft.dateOfBirth ?? user.dateOfBirth;
      setDateOfBirth(dateValue ? new Date(`${dateValue}T00:00:00.000Z`) : null);
      setSelectedAvatar(draft.selectedAvatar ?? null);
      setRemoveAvatar(Boolean(draft.removeAvatar));
      setAvatarPreviewUrl(
        draft.selectedAvatar?.uri
          ?? (draft.removeAvatar ? null : user.avatarUrl),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [auth.user]);

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
      if (auth.user) {
        void updateParentDetailsDraft(auth.user.id, {
          selectedAvatar: nextAvatar,
          removeAvatar: false,
        });
      }
      setSubmitError(null);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to select the profile photo.');
    }
  }

  function handleRemoveAvatar() {
    setSelectedAvatar(null);
    setAvatarPreviewUrl(null);
    setRemoveAvatar(Boolean(auth.user?.avatarUrl));
    if (auth.user) {
      void updateParentDetailsDraft(auth.user.id, {
        selectedAvatar: null,
        removeAvatar: Boolean(auth.user.avatarUrl),
      });
    }
    setSubmitError(null);
  }

  async function handleConnectGoogle() {
    setIsConnectingGoogle(true);
    setSubmitError(null);
    setErrors((current) => ({ ...current, google: undefined }));

    try {
      const profile = await connectGoogleEmail();
      auth.applyProfilePatch(profile);
      await auth.refreshSession();
    } catch (error) {
      setErrors((current) => ({
        ...current,
        google: error instanceof Error ? error.message : 'Failed to verify your Google email.',
      }));
    } finally {
      setIsConnectingGoogle(false);
    }
  }

  async function handleContinue() {
    const nextErrors: typeof errors = {};

    if (!isMeaningfulParentName(fullName, auth.user?.phoneNumber)) {
      nextErrors.fullName = fullName.trim()
        ? 'Enter your full name, not your phone number.'
        : 'Enter your full name.';
    }

    if (!currentAddress.trim()) {
      nextErrors.currentAddress = 'Enter your current address.';
    }

    if (!auth.user?.emailVerified) {
      nextErrors.google = 'Connect Google to verify your email.';
    }

    if (!dateOfBirth) {
      nextErrors.dateOfBirth = 'Select a valid date of birth.';
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSaving(true);
    setSubmitError(null);

    try {
      const nextDateOfBirth = dateOfBirth;

      if (!nextDateOfBirth) {
        setErrors((current) => ({ ...current, dateOfBirth: 'Select a valid date of birth.' }));
        return;
      }

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

      const profile = await updateMe({
        displayName: fullName.trim(),
        currentAddress: currentAddress.trim(),
        dateOfBirth: toIsoDate(nextDateOfBirth),
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      });
      auth.applyProfilePatch(profile);
      await auth.refreshSession();
      router.replace('/onboarding/family');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to save your profile.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleDateChange(value: Date) {
    setDateOfBirth(value);
    if (auth.user) {
      void updateParentDetailsDraft(auth.user.id, { dateOfBirth: toIsoDate(value) });
    }
    if (errors.dateOfBirth) {
      setErrors((current) => ({ ...current, dateOfBirth: undefined }));
    }
  }

  return (
    <MinimalOnboardingScreen
      backHref="/auth/sign-in"
      footer={(
        <AuthPrimaryButton
          disabled={isSaving || isConnectingGoogle}
          label={isSaving ? 'Saving...' : 'Continue'}
          onPress={() => {
            void handleContinue();
          }}
        />
      )}
      progressCurrent={1}
      progressTotal={4}
      title="Your details">
      <AvatarPhotoField
        actionsDisabled={isSaving}
        backgroundColor={styles.avatarPreview.backgroundColor}
        helperText="Optional. Add a photo for your parent profile."
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
        error={errors.fullName ?? null}
        label="Full name"
        onChangeText={value => {
          setFullName(value);
          if (auth.user) {
            void updateParentDetailsDraft(auth.user.id, { fullName: value });
          }
          if (errors.fullName) {
            setErrors(current => ({ ...current, fullName: undefined }));
          }
        }}
        placeholder="Parent full name"
        value={fullName}
      />
      <DateOfBirthField
        defaultPickerDate={new Date('1990-01-01T00:00:00.000Z')}
        disabled={isSaving}
        error={errors.dateOfBirth ?? null}
        onChange={handleDateChange}
        placeholder="Select your date of birth"
        value={dateOfBirth}
      />
      <AddressPlaceField
        disabled={isSaving}
        error={errors.currentAddress ?? null}
        onChangeText={value => {
          setCurrentAddress(value);
          if (auth.user) {
            void updateParentDetailsDraft(auth.user.id, { currentAddress: value });
          }
          if (errors.currentAddress) {
            setErrors(current => ({ ...current, currentAddress: undefined }));
          }
        }}
        value={currentAddress}
      />
      <View style={styles.googleBlock}>
        <GoogleConnectButton
          disabled={isConnectingGoogle}
          error={Boolean(errors.google)}
          loading={isConnectingGoogle}
          onPress={() => {
            void handleConnectGoogle();
          }}
          verifiedEmail={verifiedEmail}
        />
        {errors.google ? <Text style={styles.errorText}>{errors.google}</Text> : null}
      </View>
      {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
    </MinimalOnboardingScreen>
  );
}

const styles = StyleSheet.create(theme => ({
  avatarPreview: {
    backgroundColor: theme.colors.avatar.tones.blue,
  },
  googleBlock: {
    gap: theme.spacing[2],
  },
  errorText: {
    color: theme.colors.alertText,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: theme.typography.weight.medium,
  },
}));
