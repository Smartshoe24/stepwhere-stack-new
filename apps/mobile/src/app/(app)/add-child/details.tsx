import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AuthPrimaryButton } from '@/features/auth/components/auth-primary-button';
import { AuthTextField } from '@/features/auth/components/auth-text-field';
import {
  clearAddChildDraft,
  getAddChildDraft,
  getOrCreateChildCreationIdempotencyKey,
  updateAddChildDraft,
} from '@/features/children/add-child-draft';
import { SchoolPlaceField } from '@/features/children/school-place-field';
import { toIsoDate } from '@/features/children/add-child-utils';
import { useAuth } from '@/features/auth/use-auth';
import { MinimalOnboardingScreen } from '@/features/onboarding/components/minimal-onboarding-screen';
import { DateOfBirthField } from '@/features/onboarding/components/date-of-birth-field';
import { AvatarPhotoField } from '@/features/profile/avatar-photo-field';
import { pickAvatarFromCamera, pickAvatarFromLibrary, type SelectedAvatar } from '@/features/profile/avatar-photo-actions';
import { ApiError, createChild, createChildAvatarUploadIntent, uploadToSignedUrl } from '@/lib/api-client';
import type { PlaceDto } from '@stepwhere/types';

function getInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'C';
}

export default function AddChildDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const returnTo = params.returnTo === 'profile' ? 'profile' : 'home';
  const connectShoeHref = `/add-child/connect-device?returnTo=${returnTo}`;
  const auth = useAuth();
  const hasFamily = Boolean(auth.user?.family.organization);
  const canManageChildren = Boolean(auth.user?.family.permissions.canManageChildren);
  const [childName, setChildName] = useState('');
  const [selectedSchoolPlace, setSelectedSchoolPlace] = useState<PlaceDto | null>(null);
  const [selectedDateOfBirth, setSelectedDateOfBirth] = useState<Date | null>(null);
  const [selectedAvatar, setSelectedAvatar] = useState<SelectedAvatar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [reservationHardwareIdentifier, setReservationHardwareIdentifier] = useState<string | null>(null);

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

      if (!hasFamily) {
        router.replace('/home');
        return;
      }

      if (!draft.reservation || new Date(draft.reservation.expiresAt) <= new Date()) {
        if (draft.reservation) {
          await updateAddChildDraft({ reservation: null });
        }
        router.replace(connectShoeHref as never);
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
  }, [connectShoeHref, hasFamily, router]);

  function handleDateChange(nextDate: Date) {
    setSelectedDateOfBirth(nextDate);
    void updateAddChildDraft({ childDateOfBirth: toIsoDate(nextDate) });
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
      await updateAddChildDraft({ avatar: avatarData });
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
      const draft = await getAddChildDraft();

      if (!draft.reservation || new Date(draft.reservation.expiresAt) <= new Date()) {
        setError('Shoe reservation expired. Connect the shoe again.');
        router.replace(connectShoeHref as never);
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

      // Committed. Navigate first, then clean up, so a cleanup failure cannot
      // strand the user on a form whose submission already succeeded.
      router.replace('/home');
      void finalizeAddChild();
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
  async function finalizeAddChild() {
    try {
      await clearAddChildDraft();
      await auth.refreshSession();
    } catch {
      // The child exists; a failed cleanup resolves on the next session refresh.
    }
  }

  /**
   * A retry of an already-committed create no longer reaches here: the server
   * replays by idempotency key, and a shoe consumed by this family resolves to
   * the child that was created. So every reservation code below is a genuine
   * dead end and needs a different shoe.
   */
  async function handleCreateChildApiError(apiError: ApiError) {
    const needsAnotherShoe = apiError.code === 'RESERVATION_ALREADY_CONSUMED'
      || apiError.code === 'DEVICE_BOUND_ELSEWHERE'
      || apiError.code === 'DEVICE_NOT_CLAIMABLE'
      || apiError.code === 'DEVICE_BLOCKED';
    const isUnusableReservation = apiError.code === 'RESERVATION_EXPIRED'
      || apiError.code === 'RESERVATION_HELD_BY_ANOTHER_USER';

    setError(needsAnotherShoe ? `${apiError.message} Connect a different shoe.` : apiError.message);

    if (needsAnotherShoe || isUnusableReservation) {
      await updateAddChildDraft({ reservation: null });
      router.replace(connectShoeHref as never);
    }
  }

  return (
    <MinimalOnboardingScreen
      backHref={connectShoeHref}
      footer={(
        <AuthPrimaryButton
          disabled={isSaving}
          label={isSaving ? 'Saving...' : 'Continue'}
          onPress={() => {
            void handleFinish();
          }}
        />
      )}
      progressCurrent={2}
      progressTotal={2}
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
          void updateAddChildDraft({ avatar: null });
        } : undefined}
      />

      <AuthTextField
        autoCapitalize="words"
        label="Child name"
        onChangeText={(value) => {
          setChildName(value);
          void updateAddChildDraft({ childName: value });
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
          void updateAddChildDraft({ schoolPlace: place ?? null });
          setError((current) => (current === "Select the child's school." ? null : current));
        }}
        selectedPlace={selectedSchoolPlace}
      />
      {error && !["Select the child's school.", 'Select the child date of birth.', 'Add a child photo to continue.'].includes(error) ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : null}
    </MinimalOnboardingScreen>
  );
}

const styles = StyleSheet.create(theme => ({
  avatarPreview: {
    backgroundColor: theme.colors.avatar.tones.mint,
  },
  sectionLabel: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: theme.typography.weight.semibold,
  },
  photoSection: {
    gap: theme.spacing[2],
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  photoPreview: {
    width: 88,
    height: 88,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholderIcon: {
    color: theme.colors.textSecondary,
  },
  photoActions: {
    flex: 1,
    gap: theme.spacing[2],
  },
  secondaryButton: {
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
  secondaryIcon: {
    color: theme.colors.button.icon,
  },
  secondaryLabel: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: theme.typography.weight.semibold,
  },
  dateField: {
    minHeight: 54,
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateFieldContent: {
    gap: 2,
  },
  dateFieldLabel: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: theme.typography.weight.semibold,
  },
  dateFieldValue: (hasValue: Date | null) => ({
    color: hasValue ? theme.colors.text : theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: theme.typography.weight.medium,
  }),
  calendarIcon: {
    color: theme.colors.textSecondary,
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
