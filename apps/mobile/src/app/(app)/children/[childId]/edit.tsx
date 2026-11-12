import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import type { ChildDetailDto, PlaceDto } from '@stepwhere/types';

import { AppBootstrapScreen } from '@/components/loading/app-bootstrap-screen';
import { AppIcon } from '@/components/ui/app-icon';
import { AuthPrimaryButton } from '@/features/auth/components/auth-primary-button';
import { AuthTextField } from '@/features/auth/components/auth-text-field';
import { ChildDeviceActionSheet } from '@/features/children/child-device-action-sheet';
import { useAuth } from '@/features/auth/use-auth';
import { SchoolPlaceField } from '@/features/children/school-place-field';
import { pickAvatarFromCamera, pickAvatarFromLibrary, type SelectedAvatar } from '@/features/profile/avatar-photo-actions';
import { AvatarPhotoField } from '@/features/profile/avatar-photo-field';
import { DateOfBirthField } from '@/features/onboarding/components/date-of-birth-field';
import { createChildAvatarUploadIntent, uploadToSignedUrl } from '@/lib/api-client';
import {
  useArchiveChildMutation,
  useChildDetailQuery,
  useUnlinkChildDeviceMutation,
  useUpdateChildMutation,
} from '@/query/hooks';

function formatLastSeen(value: string | null) {
  if (!value) {
    return 'Last seen unavailable';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Last seen unavailable';
  }

  return `Last seen ${date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  })} ${date.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

function toIsoDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function getInitials(name: string, fallback: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 0
    ? parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
    : fallback;
}

export default function EditChildScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ childId?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const { rt } = useUnistyles();
  const childId = typeof params.childId === 'string' ? params.childId : null;
  const canManageChildren = Boolean(auth.user?.family.permissions.canManageChildren);
  const childQuery = useChildDetailQuery(childId, canManageChildren);

  React.useEffect(() => {
    if (!canManageChildren) {
      router.replace('/profile');
    }
  }, [canManageChildren, router]);

  if (!canManageChildren || !childId || auth.status === 'loading' || childQuery.isPending) {
    return <AppBootstrapScreen />;
  }

  if (!childQuery.data) {
    return (
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <StatusBar style={rt.themeName === 'dark' ? 'light' : 'dark'} />
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Child not found</Text>
          <Pressable onPress={() => router.replace('/profile')} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Text style={styles.backButtonLabel}>Back to profile</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return <EditChildScreenBody bottomInset={insets.bottom} child={childQuery.data} childId={childId} />;
}

type EditChildScreenBodyProps = {
  bottomInset: number;
  child: ChildDetailDto;
  childId: string;
};

function EditChildScreenBody({ bottomInset, child, childId }: EditChildScreenBodyProps) {
  const router = useRouter();
  const { rt, theme } = useUnistyles();
  const updateChildMutation = useUpdateChildMutation();
  const unlinkChildDeviceMutation = useUnlinkChildDeviceMutation();
  const archiveChildMutation = useArchiveChildMutation();
  const [childName, setChildName] = React.useState(child.name);
  const [selectedDateOfBirth, setSelectedDateOfBirth] = React.useState<Date | null>(
    child.dateOfBirth ? new Date(`${child.dateOfBirth}T00:00:00.000Z`) : null,
  );
  const scrollRef = React.useRef<ScrollView>(null);
  const [selectedSchoolPlace, setSelectedSchoolPlace] = React.useState<PlaceDto | null>(child.schoolPlace);
  const [selectedAvatar, setSelectedAvatar] = React.useState<SelectedAvatar | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = React.useState<string | null>(child.avatarUrl);
  const [removeAvatar, setRemoveAvatar] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [isDeviceSheetVisible, setIsDeviceSheetVisible] = React.useState(false);
  const deviceSummary = child.summary.deviceSummary;
  const avatarInitials = getInitials(childName, child.summary.initials);

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
      setError(nextError instanceof Error ? nextError.message : 'Failed to select the child photo.');
    }
  }

  function handleRemoveAvatar() {
    setSelectedAvatar(null);
    setAvatarPreviewUrl(null);
    setRemoveAvatar(Boolean(child.avatarUrl));
    setError(null);
  }

  function handleDateChange(nextDate: Date) {
    setSelectedDateOfBirth(nextDate);
  }

  async function handleSave() {
    if (!childName.trim()) {
      setError('Enter the child name.');
      return;
    }

    if (!selectedSchoolPlace) {
      setError("Select the child's school.");
      return;
    }

    setError(null);
    setSuccessMessage(null);

    try {
      let avatarUrl: string | null | undefined;

      if (selectedAvatar) {
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

        avatarUrl = uploadIntent.path;
      } else if (removeAvatar) {
        avatarUrl = null;
      }

      await updateChildMutation.mutateAsync({
        childId,
        input: {
          name: childName.trim(),
          dateOfBirth: toIsoDate(selectedDateOfBirth),
          schoolPlaceId: selectedSchoolPlace.id,
          ...(avatarUrl !== undefined ? { avatarUrl } : {}),
        },
      });

      router.replace('/profile');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to update the child.');
    }
  }

  async function handleUnlinkDevice() {
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await unlinkChildDeviceMutation.mutateAsync({ childId });
      setSuccessMessage(result.unlinked ? 'Shoe unlinked.' : 'No shoe was linked.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to unlink the shoe.');
    }
  }

  async function handleArchiveChild() {
    setError(null);
    setSuccessMessage(null);

    try {
      await archiveChildMutation.mutateAsync({ childId });
      router.replace('/profile');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to remove the child.');
    }
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <StatusBar style={rt.themeName === 'dark' ? 'light' : 'dark'} />
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <AppIcon color={styles.headerIcon.color} name="arrow-left" size={18} />
          </Pressable>
          <Text numberOfLines={1} style={styles.headerTitle}>Edit child</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={styles.scrollContent(bottomInset)}
          keyboardShouldPersistTaps="handled"
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <AvatarPhotoField
              actionsDisabled={updateChildMutation.isPending}
              backgroundColor={theme.colors.avatar.tones.mint}
              helperText="Add, replace, or remove the child photo."
              imageUrl={avatarPreviewUrl}
              initials={avatarInitials}
              label="Child photo"
              onCameraPress={() => {
                void handleAvatarPick('camera');
              }}
              onLibraryPress={() => {
                void handleAvatarPick('library');
              }}
              onRemovePress={avatarPreviewUrl ? handleRemoveAvatar : undefined}
            />
            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle}>{childName.trim() || child.name}</Text>
              <Text style={styles.heroSubtitle}>{child.summary.statusLabel ?? 'Child profile'}</Text>
            </View>
          </View>

          <View style={styles.formCard}>
            <AuthTextField
              autoCapitalize="words"
              label="Child name"
              onChangeText={setChildName}
              placeholder="Aarav"
              value={childName}
            />

            <DateOfBirthField
              disabled={updateChildMutation.isPending}
              onChange={handleDateChange}
              value={selectedDateOfBirth}
            />

            <SchoolPlaceField
              error={error === "Select the child's school." ? error : null}
              onSelect={(place) => {
                setSelectedSchoolPlace(place ?? null);
                setError((current) => (current === "Select the child's school." ? null : current));
              }}
              onFocus={() => {
                setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 180);
              }}
              selectedPlace={selectedSchoolPlace}
            />
          </View>

          {deviceSummary ? (
            <View style={styles.deviceCard}>
              <View style={styles.deviceHeader}>
                <View style={styles.deviceIconPlate}>
                  <AppIcon color={styles.deviceIcon.color} name="cellphone" size={18} />
                </View>
                <View style={styles.deviceCopy}>
                  <Text style={styles.deviceTitle}>Connected shoe</Text>
                  <Text style={styles.deviceSubtitle}>{deviceSummary.hardwareIdentifier ? `Shoe ID: ${deviceSummary.hardwareIdentifier}` : 'Shoe ID unavailable'}</Text>
                </View>
              </View>
              <Text style={styles.deviceMeta}>{formatLastSeen(deviceSummary.lastSeenAt)}</Text>
              <Pressable
                accessibilityRole="button"
                disabled={unlinkChildDeviceMutation.isPending}
                onPress={() => setIsDeviceSheetVisible(true)}
                style={({ pressed }) => [
                  styles.unlinkButton,
                  unlinkChildDeviceMutation.isPending && styles.unlinkButtonDisabled,
                  pressed && !unlinkChildDeviceMutation.isPending && styles.pressed,
                ]}
              >
                <AppIcon color={styles.unlinkIcon.color} name="logout" size={16} />
                <Text style={styles.unlinkLabel}>
                  {unlinkChildDeviceMutation.isPending ? 'Unlinking...' : 'Unlink shoe'}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.deviceCard}>
              <View style={styles.deviceHeader}>
                <View style={styles.deviceIconPlate}>
                  <AppIcon color={styles.deviceIcon.color} name="cellphone" size={18} />
                </View>
                <View style={styles.deviceCopy}>
                  <Text style={styles.deviceTitle}>No shoe linked</Text>
                  <Text style={styles.deviceSubtitle}>Live tracking is paused until a shoe is connected.</Text>
                </View>
              </View>
              <View style={styles.deviceActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push(`/children/${childId}/link-device` as never)}
                  style={({ pressed }) => [styles.deviceActionButton, pressed && styles.pressed]}
                >
                  <AppIcon color={styles.deviceActionIcon.color} name="plus" size={16} />
                  <Text style={styles.deviceActionLabel}>Link shoe</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={archiveChildMutation.isPending}
                  onPress={() => {
                    Alert.alert(
                      'Remove child?',
                      `This removes ${child.name} from your active family list.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Remove child',
                          style: 'destructive',
                          onPress: () => {
                            void handleArchiveChild();
                          },
                        },
                      ],
                    );
                  }}
                  style={({ pressed }) => [styles.deviceActionButtonDanger, archiveChildMutation.isPending && styles.unlinkButtonDisabled, pressed && !archiveChildMutation.isPending && styles.pressed]}
                >
                  <AppIcon color={styles.deviceActionDangerIcon.color} name="trash" size={16} />
                  <Text style={styles.deviceActionDangerLabel}>{archiveChildMutation.isPending ? 'Removing...' : 'Remove child'}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}
          {error && error !== "Select the child's school." ? <Text style={styles.errorText}>{error}</Text> : null}

          <AuthPrimaryButton
            disabled={updateChildMutation.isPending}
            label={updateChildMutation.isPending ? 'Saving...' : 'Save changes'}
            onPress={() => {
              void handleSave();
            }}
          />
        </ScrollView>
      </View>
      <ChildDeviceActionSheet
        childName={child.name}
        deviceHardwareIdentifier={deviceSummary?.hardwareIdentifier ?? null}
        isPending={unlinkChildDeviceMutation.isPending || archiveChildMutation.isPending}
        onClose={() => setIsDeviceSheetVisible(false)}
        onConfirm={({ deleteChild }) => {
          setIsDeviceSheetVisible(false);
          if (deleteChild) {
            void handleArchiveChild();
            return;
          }

          void handleUnlinkDevice();
        }}
        visible={isDeviceSheetVisible}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create((theme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    minHeight: 56,
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[2],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.button.surface,
    borderWidth: 1,
    borderColor: theme.colors.button.border,
  },
  headerIcon: {
    color: theme.colors.button.icon,
  },
  headerTitle: {
    flex: 1,
    color: theme.colors.text,
    textAlign: 'center',
    fontFamily: theme.typography.family.display,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: theme.typography.weight.semibold,
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  scrollContent: (bottomInset: number) => ({
    gap: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[4],
    paddingBottom: Math.max(bottomInset, 12) + 36,
  }),
  heroCard: {
    gap: theme.spacing[3],
    alignItems: 'stretch',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing[4],
    ...theme.shadows.card,
  },
  heroCopy: {
    gap: 2,
  },
  heroTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: theme.typography.weight.semibold,
  },
  heroSubtitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
  },
  formCard: {
    gap: theme.spacing[3],
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing[4],
    ...theme.shadows.card,
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
  dateFieldContent: {
    flex: 1,
    gap: 2,
  },
  dateFieldLabel: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
  },
  dateFieldValue: (selectedDateOfBirth: Date | null) => ({
    color: selectedDateOfBirth ? theme.colors.text : theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: theme.typography.weight.medium,
  }),
  calendarIcon: {
    color: theme.colors.icon,
  },
  deviceCard: {
    gap: theme.spacing[3],
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing[4],
    ...theme.shadows.card,
  },
  deviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  deviceIconPlate: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceMuted,
  },
  deviceIcon: {
    color: theme.colors.primaryGreen,
  },
  deviceCopy: {
    flex: 1,
    gap: 2,
  },
  deviceTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: theme.typography.weight.medium,
  },
  deviceSubtitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
  },
  deviceMeta: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
  },
  deviceActions: {
    flexDirection: 'row',
    gap: theme.spacing[3],
  },
  deviceActionButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
  },
  deviceActionIcon: {
    color: theme.colors.button.icon,
  },
  deviceActionLabel: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: theme.typography.weight.semibold,
  },
  deviceActionButtonDanger: {
    flex: 1,
    minHeight: 44,
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.alertBorder,
    backgroundColor: theme.colors.alertBackground,
    paddingHorizontal: theme.spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
  },
  deviceActionDangerIcon: {
    color: theme.colors.alertText,
  },
  deviceActionDangerLabel: {
    color: theme.colors.alertText,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: theme.typography.weight.semibold,
  },
  unlinkButton: {
    minHeight: 44,
    alignSelf: 'flex-start',
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.alertBorder,
    backgroundColor: theme.colors.alertBackground,
    paddingHorizontal: theme.spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  unlinkButtonDisabled: {
    opacity: 0.6,
  },
  unlinkIcon: {
    color: theme.colors.alertText,
  },
  unlinkLabel: {
    color: theme.colors.alertText,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: theme.typography.weight.semibold,
  },
  successText: {
    color: theme.colors.telemetry.positiveText,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: theme.typography.weight.medium,
  },
  errorText: {
    color: theme.colors.alertText,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: theme.typography.weight.medium,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
  },
  emptyTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: theme.typography.weight.semibold,
  },
  backButton: {
    minHeight: 44,
    borderRadius: theme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primaryGreen,
    paddingHorizontal: theme.spacing[4],
  },
  backButtonLabel: {
    color: '#FFFFFF',
    fontFamily: theme.typography.family.body,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: theme.typography.weight.semibold,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
