import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import React from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { AppBootstrapScreen } from "@/components/loading/app-bootstrap-screen";
import { AppIcon } from "@/components/ui/app-icon";
import { Avatar } from "@/components/ui/avatar";
import { useAuth } from "@/features/auth/use-auth";
import { FamilyInviteQrSheet } from "@/features/profile/family-invite-qr-sheet";
import {
  useFamilyMembersQuery,
  useRemoveFamilyMemberMutation,
} from "@/query/hooks";

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "M"
  );
}

export default function FamilyMembersScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { rt, theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const [isInviteVisible, setIsInviteVisible] = React.useState(false);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const organizationId = auth.user?.family.organization?.id ?? null;
  const familyName =
    auth.user?.family.organization?.familyName ??
    auth.user?.family.organization?.name ??
    "Family";
  const canManageMembers = Boolean(
    auth.user?.family.permissions.canManageMembers,
  );
  const membersQuery = useFamilyMembersQuery(organizationId);
  const removeMemberMutation = useRemoveFamilyMemberMutation();

  React.useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeout = setTimeout(() => setToastMessage(null), 2200);
    return () => clearTimeout(timeout);
  }, [toastMessage]);

  if (auth.status === "loading") {
    return <AppBootstrapScreen />;
  }

  async function handleRemoveMember(memberId: string, displayName: string) {
    try {
      await removeMemberMutation.mutateAsync({ memberId });
      setToastMessage("Member removed.");
    } catch (error) {
      setToastMessage(
        error instanceof Error ? error.message : "Could not remove the member.",
      );
    }
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <StatusBar style={rt.themeName === "dark" ? "light" : "dark"} />
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.pressed,
            ]}
          >
            <AppIcon
              color={styles.headerIcon.color}
              name="arrow-left"
              size={18}
            />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>Family members</Text>
            <Text style={styles.headerSubtitle}>
              View who can access this family.
            </Text>
          </View>
          {auth.user?.family.permissions.canManageJoinCodes ? (
            <Pressable
              onPress={() => setIsInviteVisible(true)}
              style={({ pressed }) => [
                styles.inviteButton,
                pressed && styles.pressed,
              ]}
            >
              <AppIcon
                color={theme.colors.primaryGreen}
                name="account-plus"
                size={18}
              />
            </Pressable>
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </View>

        {membersQuery.isPending ? (
          <View style={styles.centerState}>
            <AppBootstrapScreen />
          </View>
        ) : membersQuery.isError ? (
          <View style={styles.centerState}>
            <Text style={styles.stateTitle}>
              Could not load family members.
            </Text>
            <Pressable
              onPress={() => membersQuery.refetch()}
              style={({ pressed }) => [
                styles.retryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.retryLabel}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent(insets.bottom)}
            showsVerticalScrollIndicator={false}
          >
            {membersQuery.data && membersQuery.data.length > 0 ? (
              membersQuery.data.map((member) => (
                <View key={member.id} style={styles.memberCard}>
                  <Avatar
                    backgroundColor={theme.colors.avatar.tones.blue}
                    imageUrl={member.user.avatarUrl}
                    initials={getInitials(member.user.displayName)}
                    size={52}
                    textSize={16}
                  />
                  <View style={styles.memberCopy}>
                    <View style={styles.memberHeader}>
                      <Text
                        ellipsizeMode="tail"
                        numberOfLines={1}
                        style={styles.memberName}
                      >
                        {member.user.displayName}
                      </Text>
                      <View style={styles.roleRow}>
                        <View style={styles.roleChip(member.role === "admin")}>
                          <Text
                            style={styles.roleLabel(member.role === "admin")}
                          >
                            {member.role === "admin" ? "Admin" : "Member"}
                          </Text>
                        </View>
                        {member.userId === auth.user?.id ? (
                          <View style={styles.youChip}>
                            <Text style={styles.youLabel}>You</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <Text numberOfLines={1} style={styles.memberMeta}>
                      {member.user.phoneNumber}
                    </Text>
                    {member.user.email ? (
                      <Text numberOfLines={1} style={styles.memberMeta}>
                        {member.user.email}
                      </Text>
                    ) : null}
                  </View>
                  {canManageMembers &&
                  member.role === "member" &&
                  member.userId !== auth.user?.id ? (
                    <Pressable
                      accessibilityLabel={`Remove ${member.user.displayName} from family`}
                      onPress={() => {
                        Alert.alert(
                          "Remove member?",
                          `${member.user.displayName} will lose access to this family and child tracking.`,
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Remove",
                              style: "destructive",
                              onPress: () => {
                                void handleRemoveMember(
                                  member.id,
                                  member.user.displayName,
                                );
                              },
                            },
                          ],
                        );
                      }}
                      style={({ pressed }) => [
                        styles.removeButton,
                        pressed && styles.pressed,
                      ]}
                    >
                      <AppIcon
                        color={styles.removeIcon.color}
                        name="trash"
                        size={18}
                      />
                    </Pressable>
                  ) : null}
                </View>
              ))
            ) : (
              <Text style={styles.stateTitle}>No family members found.</Text>
            )}

            {toastMessage ? (
              <Text style={styles.toastText}>{toastMessage}</Text>
            ) : null}
          </ScrollView>
        )}

        <FamilyInviteQrSheet
          familyName={familyName}
          onClose={() => setIsInviteVisible(false)}
          visible={isInviteVisible}
        />
      </View>
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
    minHeight: 72,
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[2],
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.circle,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.button.surface,
    borderWidth: 1,
    borderColor: theme.colors.button.border,
  },
  headerIcon: {
    color: theme.colors.button.icon,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: theme.typography.weight.semibold,
  },
  headerSubtitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  inviteButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.circle,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.softGreen,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[6],
    gap: theme.spacing[3],
  },
  stateTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  retryButton: {
    minHeight: 42,
    borderRadius: theme.radius.button,
    paddingHorizontal: theme.spacing[4],
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primaryGreen,
  },
  retryLabel: {
    color: "#FFFFFF",
    fontFamily: theme.typography.family.display,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: theme.typography.weight.semibold,
  },
  scrollContent: (bottomInset: number) => ({
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
    paddingBottom: Math.max(bottomInset, 12) + 36,
  }),
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    borderRadius: theme.radius.cardSmall,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing[4],
    ...theme.shadows.card,
  },
  memberCopy: {
    flex: 1,
    // flexDirection: "row",
    minWidth: 0,
    gap: 2,
  },
  memberHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minWidth: 0,
  },
  memberName: {
    flexShrink: 1,
    maxWidth: "68%",
    minWidth: 0,
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: theme.typography.weight.medium,
  },
  roleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flexShrink: 0,
  },
  roleChip: (isAdmin: boolean) => ({
    borderRadius: theme.radius.pill,
    backgroundColor: isAdmin
      ? theme.colors.softGreen
      : theme.colors.surfaceMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
  }),
  roleLabel: (isAdmin: boolean) => ({
    color: isAdmin ? theme.colors.primaryGreen : theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: theme.typography.weight.semibold,
  }),
  youChip: {
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  youLabel: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: theme.typography.weight.semibold,
  },
  memberMeta: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
  },
  removeButton: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.circle,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.alertBackground,
    alignSelf: "center",
    flexShrink: 0,
  },
  removeIcon: {
    color: theme.colors.alertText,
  },
  toastText: {
    color: theme.colors.primaryGreen,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
