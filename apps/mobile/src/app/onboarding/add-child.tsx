import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AuthPrimaryButton } from '@/features/auth/components/auth-primary-button';
import { AuthTextField } from '@/features/auth/components/auth-text-field';
import { useAuth } from '@/features/auth/use-auth';
import { SchoolPlaceField } from '@/features/children/school-place-field';
import {
  clearOnboardingDraft,
  getOnboardingDraft,
  getOrCreateChildCreationIdempotencyKey,
  updateOnboardingDraft,
} from '@/features/onboarding/onboarding-draft';
import { MinimalOnboardingScreen } from '@/features/onboarding/components/minimal-onboarding-screen';
import { DateOfBirthField } from '@/features/onboarding/components/date-of-birth-field';
import { AvatarPhotoField } from '@/features/profile/avatar-photo-field';
import { pickAvatarFromCamera, pickAvatarFromLibrary, type SelectedAvatar } from '@/features/profile/avatar-photo-actions';
import { ApiError, createChild, createChildAvatarUploadIntent, uploadToSignedUrl } from '@/lib/api-client';
import type { PlaceDto } from '@stepwhere/types';

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'C';
}

export default function AddChildScreen() {
  const router = useRouter();
  const auth = useAuth();
  const hasFamily = Boolean(auth.user?.family.organization);
  const refreshOnboardingDraft = auth.refreshOnboardingDraft;
  const [childName, setChildName] = useState('');
  const [selectedSchoolPlace, setSelectedSchoolPlace] = useState<PlaceDto | null>(null);
  const [selectedDateOfBirth, setSelectedDateOfBirth] = useState<Date | null>(null);
  const [selectedAvatar, setSelectedAvatar] = useState<SelectedAvatar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [reservationHardwareIdentifier, setReservationHardwareIdentifier] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function hydrateDraft() {
      const draft = await getOnboardingDraft();

      if (cancelled) {
        return;
      }

      if (!hasFamily) {
        router.replace('/onboarding/family');
        return;
      }

      if (!draft.reservation || new Date(draft.reservation.expiresAt) <= new Date()) {
        if (draft.reservation) {
          await updateOnboardingDraft({ reservation: null });
          await refreshOnboardingDraft();
        }
        router.replace('/onboarding/connect-device');
        return;
      }

      setReservationHardwareIdentifier(draft.reservation.hardwareIdentifier);
      setChildName(draft.childName ?? '');
      setSelectedSchoolPlace(draft.schoolPlace ?? null);
      setSelectedDateOfBirth(draft.childDateOfBirth ? new Date(`${draft.childDateOfBirth}T00:00:00.000Z`) : null);
      if (draft.avatar) {
        setSelectedAvatar({
          uri: draft.avatar.uri,
          fileName: draft.avatar.fileName,
          fileSize: draft.avatar.fileSize,
          contentType: draft.avatar.contentType,
        });
      }
    }

    void hydrateDraft();

    return () => {
      cancelled = true;
    };
  }, [hasFamily, refreshOnboardingDraft, router]);

  function handleDateChange(nextDate: Date) {
    setSelectedDateOfBirth(nextDate);
    void updateOnboardingDraft({ childDateOfBirth: toIsoDate(nextDate) });
  }

  async function pickAvatar(source: 'camera' | 'library') {
    try {
      const avatarData = source === 'camera'
        ? await pickAvatarFromCamera()
        : await pickAvatarFromLibrary();

      if (!avatarData) {
        return;
      }

      setSelectedAvatar(avatarData);
      await updateOnboardingDraft({ avatar: avatarData });
      await refreshOnboardingDraft();
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to select the child photo.');
    }
  }

  async function handleFinish() {
    if (!childName.trim()) {
      setError('Enter the child name.');
      return;
    }

    if (!selectedDateOfBirth) {
      setError('Select the child date of birth.');
      return;
    }

    if (!selectedAvatar) {
      setError('Add a child photo to continue.');
      return;
    }

    if (!selectedSchoolPlace) {
      setError("Select the child's school.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const draft = await getOnboardingDraft();

      if (!draft.reservation || new Date(draft.reservation.expiresAt) <= new Date()) {
        setError('Shoe reservation expired. Connect the shoe again.');
        router.replace('/onboarding/connect-device');
        return;
      }

      // Minted once and persisted, so a retry after a lost response replays the
      // original request instead of creating a second child.
      const idempotencyKey = await getOrCreateChildCreationIdempotencyKey();

      const uploadIntent = await createChildAvatarUploadIntent({
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

      await createChild({
        name: childName.trim(),
        avatarUrl: uploadIntent.path,
        dateOfBirth: toIsoDate(selectedDateOfBirth),
        schoolPlaceId: selectedSchoolPlace.id,
        deviceReservationToken: draft.reservation.reservationToken,
        idempotencyKey,
      });

      // Creation is committed from here on. The cached profile is patched before
      // any local cleanup so the (app) layout guard cannot read a stale
      // `onboardingCompleted: false` and route back to the scanner, and so a
      // cleanup failure can never undo a successful create.
      auth.applyProfilePatch({ onboardingCompleted: true });
      router.replace('/home');

      void finalizeOnboarding();
    } catch (nextError) {
      if (nextError instanceof ApiError) {
        await handleCreateChildApiError(nextError);
      } else {
        setError(nextError instanceof Error ? nextError.message : 'Failed to create the child.');
      }
    } finally {
      setIsSaving(false);
    }
  }

  /** Best-effort cleanup. Nothing here may block or reverse the navigation. */
  async function finalizeOnboarding() {
    try {
      await clearOnboardingDraft();
      await auth.refreshOnboardingDraft();
      await auth.refreshSession();
    } catch {
      // The child exists and the profile is already patched; a failed cleanup
      // resolves itself on the next session refresh.
    }
  }

  /**
   * A retry of an already-committed create no longer reaches here: the server
   * replays by idempotency key, and a shoe consumed by this family resolves to
   * the child that was created. So every code below is a genuine dead end for
   * this reservation, and all of them need a different shoe.
   */
  async function handleCreateChildApiError(apiError: ApiError) {
    const needsAnotherShoe = apiError.code === 'RESERVATION_ALREADY_CONSUMED'
      || apiError.code === 'DEVICE_BOUND_ELSEWHERE'
      || apiError.code === 'DEVICE_NOT_CLAIMABLE'
      || apiError.code === 'DEVICE_BLOCKED';

    if (needsAnotherShoe) {
      setError(`${apiError.message} Connect a different shoe.`);
      await updateOnboardingDraft({ reservation: null });
      await auth.refreshOnboardingDraft();
      router.replace('/onboarding/connect-device');
      return;
    }

    if (
      apiError.code === 'RESERVATION_EXPIRED'
      || apiError.code === 'RESERVATION_HELD_BY_ANOTHER_USER'
    ) {
      setError(apiError.message);
      await updateOnboardingDraft({ reservation: null });
      await auth.refreshOnboardingDraft();
      router.replace('/onboarding/connect-device');
      return;
    }

    // Validation and server faults leave the form intact so the entered details
    // are not lost.
    setError(apiError.message);
  }

  return (
    <MinimalOnboardingScreen
      backHref="/onboarding/connect-device"
      footer={(
        <AuthPrimaryButton
          disabled={isSaving}
          label={isSaving ? 'Saving...' : 'Continue'}
          onPress={() => {
            void handleFinish();
          }}
        />
      )}
      progressCurrent={4}
      progressTotal={4}
      subtitle={reservationHardwareIdentifier ? `Shoe ID: ${reservationHardwareIdentifier}` : undefined}
      title="Child details">
      <AvatarPhotoField
        actionsDisabled={isSaving}
        backgroundColor={styles.avatarPreview.backgroundColor}
        error={error === 'Add a child photo to continue.' ? error : null}
        helperText="Required for a clear child profile."
        imageUrl={selectedAvatar?.uri ?? null}
        initials={getInitials(childName)}
        label="Child photo"
        onCameraPress={() => { void pickAvatar('camera'); }}
        onLibraryPress={() => { void pickAvatar('library'); }}
        onRemovePress={selectedAvatar ? () => {
          setSelectedAvatar(null);
          void updateOnboardingDraft({ avatar: null });
          void refreshOnboardingDraft();
        } : undefined}
      />

      <AuthTextField
        autoCapitalize="words"
        label="Child name"
        onChangeText={(value) => {
          setChildName(value);
          void updateOnboardingDraft({ childName: value });
        }}
        placeholder="Aarav"
        value={childName}
      />
      <DateOfBirthField
        disabled={isSaving}
        error={error === 'Select the child date of birth.' ? error : null}
        onChange={handleDateChange}
        value={selectedDateOfBirth}
      />
      <SchoolPlaceField
        error={error === "Select the child's school." ? error : null}
        onSelect={(place) => {
          setSelectedSchoolPlace(place ?? null);
          void updateOnboardingDraft({ schoolPlace: place ?? null });
          setError((current) => (current === "Select the child's school." ? null : current));
        }}
        selectedPlace={selectedSchoolPlace}
      />
      {error && !["Select the child's school.", 'Select the child date of birth.', 'Add a child photo to continue.'].includes(error) ? <Text style={styles.errorText}>{error}</Text> : null}
    </MinimalOnboardingScreen>
  );
}

const styles = StyleSheet.create(theme => ({
  avatarPreview: {
    backgroundColor: theme.colors.avatar.tones.mint,
  },
  errorText: {
    color: theme.colors.alertText,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: theme.typography.weight.medium,
  },
}));
