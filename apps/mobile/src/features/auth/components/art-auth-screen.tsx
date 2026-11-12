import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Keyboard, Pressable, Text, useWindowDimensions, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import Animated, {
  FadeInUp,
  FadeOutDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

import type { AuthOtpIntent, UserProfileDto } from "@stepwhere/types";

import { AppIcon } from "@/components/ui/app-icon";
import { AuthActionButton } from "@/features/auth/components/auth-action-button";
import {
  AuthOtpField,
  type AuthOtpFieldHandle,
} from "@/features/auth/components/auth-otp-field";
import { ArtAuthPhoneField } from "@/features/auth/components/art-auth-phone-field";
import {
  clearOtpChallengeSession,
  createOtpChallengeSession,
  getOtpChallengeSession,
  getOtpResendCountdown,
  isOtpChallengeSessionActive,
  saveOtpChallengeSession,
  type PersistedOtpChallengeSession,
} from "@/features/auth/otp-challenge-session";
import { useAuth } from "@/features/auth/use-auth";
import { useKeyboardVisibility } from "@/features/auth/components/use-keyboard-visibility";
import { consumeAccountDeletionNotice } from "@/features/profile/account-deletion-challenge-session";
import { formatGracePeriodEnd } from "@/features/profile/profile-formatters";
import { AppBootstrapScreen } from "@/components/loading/app-bootstrap-screen";
import {
  ApiError,
  getMe,
  prepareOtp,
  startSigninRecovery,
  verifySigninRecovery,
} from "@/lib/api-client";
import { authClient, getBetterAuthErrorMessage } from "@/lib/auth-client";

type AuthStep = "form" | "otp" | "recoveryOtp" | "preview";
type ArtLayoutMode =
  | "keyboardOtp"
  | "keyboardForm"
  | "defaultOtp"
  | "defaultForm";

const thumbnailSource = require("../../../../assets/thumbnail.webp");
const challengeHeaderName = "x-stepwhere-challenge";

function sanitizePhone(value: string) {
  return value.replace(/\D/g, "").slice(0, 10);
}

function toE164Phone(value: string) {
  return `+91${sanitizePhone(value)}`;
}

function formatPhoneLabel(value: string) {
  if (value.length <= 5) {
    return value;
  }

  return `${value.slice(0, 5)} ${value.slice(5)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getNextRoute(profile: UserProfileDto) {
  if (profile.onboardingCompleted) {
    return "/home" as const;
  }

  if (profile.family.organization) {
    return "/onboarding/connect-device" as const;
  }

  return "/onboarding/details" as const;
}

async function persistOtpSessionSafely(session: PersistedOtpChallengeSession) {
  try {
    await saveOtpChallengeSession(session);
  } catch {
    // Secure storage is a resilience layer; a storage failure must not discard
    // an OTP that the server has already sent.
  }
}

async function clearOtpSessionSafely() {
  try {
    await clearOtpChallengeSession();
  } catch {
    // Authentication completion and navigation must not depend on local cleanup.
  }
}

function isPreviewAccessError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  if ("code" in error && error.code === "PREVIEW_ACCESS_REQUIRED") {
    return true;
  }

  const nestedError = "error" in error ? error.error : null;

  return Boolean(
    nestedError
      && typeof nestedError === "object"
      && "code" in nestedError
      && nestedError.code === "PREVIEW_ACCESS_REQUIRED",
  );
}

function getArtLayoutMode(input: {
  keyboardVisible: boolean;
  step: AuthStep;
}): ArtLayoutMode {
  const otpLikeStep = input.step === "otp" || input.step === "recoveryOtp";

  if (input.keyboardVisible && otpLikeStep) {
    return "keyboardOtp";
  }

  if (input.keyboardVisible) {
    return "keyboardForm";
  }

  if (otpLikeStep) {
    return "defaultOtp";
  }

  return "defaultForm";
}

export function ArtAuthScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const keyboard = useKeyboardVisibility();
  const auth = useAuth();
  const otpRef = useRef<AuthOtpFieldHandle | null>(null);
  const recoveryOtpRef = useRef<AuthOtpFieldHandle | null>(null);
  const [step, setStep] = useState<AuthStep>("form");
  const [otpSession, setOtpSession] = useState<PersistedOtpChallengeSession | null>(null);
  const [isOtpSessionPending, setIsOtpSessionPending] = useState(true);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [recoveryOtp, setRecoveryOtp] = useState("");
  const [recoveryChallengeToken, setRecoveryChallengeToken] = useState("");
  const [recoveryMaskedEmail, setRecoveryMaskedEmail] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isRequestingOtp, setIsRequestingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isRequestingRecovery, setIsRequestingRecovery] = useState(false);
  const [isVerifyingRecovery, setIsVerifyingRecovery] = useState(false);
  const [deletionNotice, setDeletionNotice] = useState(false);
  const [deletionNoticeScheduledFor, setDeletionNoticeScheduledFor] = useState<string | null>(null);
  const authIntent: AuthOtpIntent | null = otpSession?.intent ?? null;
  const resendCountdown = getOtpResendCountdown(otpSession, clockNow);

  const usableHeight = Math.max(
    windowHeight - insets.top - insets.bottom - keyboard.height,
    keyboard.visible ? 360 : 520,
  );
  const artHeight = useMemo(() => {
    const layoutMode = getArtLayoutMode({
      keyboardVisible: keyboard.visible,
      step,
    });

    let ratio: number;
    let minHeight: number;
    let maxHeight: number;

    switch (layoutMode) {
      case "keyboardOtp":
        ratio = 0.4;
        minHeight = 112;
        maxHeight = 210;
        break;

      case "keyboardForm":
        ratio = 0.54;
        minHeight = 176;
        maxHeight = 430;
        break;

      case "defaultOtp":
        ratio = 0.54;
        minHeight = 176;
        maxHeight = 410;
        break;

      case "defaultForm":
        ratio = 0.54;
        minHeight = 176;
        maxHeight = 430;
        break;
    }

    return Math.round(clamp(usableHeight * ratio, minHeight, maxHeight));
  }, [keyboard.visible, step, usableHeight]);
  const phoneLabel = formatPhoneLabel(phone);
  const verifyDisabled = otp.length !== 6;
  const verifyRecoveryDisabled = recoveryOtp.length !== 6;
  const isCompact = keyboard.visible;
  const artHeightValue = useSharedValue(artHeight);

  useEffect(() => {
    artHeightValue.value = withTiming(artHeight, { duration: 280 });
  }, [artHeight, artHeightValue]);

  useEffect(() => {
    if (step !== "otp" && step !== "recoveryOtp") {
      return;
    }

    const timer = setTimeout(() => {
      if (step === "otp") {
        otpRef.current?.focus();
        return;
      }

      recoveryOtpRef.current?.focus();
    }, 120);

    return () => clearTimeout(timer);
  }, [step]);

  // A route param cannot survive the sign-out redirect into this screen, so the
  // deletion notice arrives as a one-shot flag that we read and clear once.
  useEffect(() => {
    let cancelled = false;

    async function hydrateDeletionNotice() {
      const notice = await consumeAccountDeletionNotice();

      if (cancelled || !notice) {
        return;
      }

      setDeletionNotice(true);
      setDeletionNoticeScheduledFor(formatGracePeriodEnd(notice.deletionScheduledFor));
    }

    void hydrateDeletionNotice();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateOtpSession() {
      try {
        const session = await getOtpChallengeSession();
        if (cancelled) {
          return;
        }

        setOtpSession(session);
        if (session) {
          setPhone(sanitizePhone(session.phoneNumber));
          setStep(session.preferredPhase);
        }
      } catch {
        if (!cancelled) {
          setOtpSession(null);
        }
      } finally {
        if (!cancelled) {
          setClockNow(Date.now());
          setIsOtpSessionPending(false);
        }
      }
    }

    void hydrateOtpSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!otpSession || step !== "otp") {
      return;
    }

    function refreshOtpClock() {
      const now = Date.now();
      setClockNow(now);

      if (otpSession && !isOtpChallengeSessionActive(otpSession, now)) {
        setOtpSession(null);
        setOtp("");
        setStep("form");
        setSubmitError("Your verification code expired. Request a new code.");
        void clearOtpSessionSafely();
      }
    }

    const timer = setInterval(refreshOtpClock, 1000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refreshOtpClock();
      }
    });

    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [otpSession, step]);

  const artContainerStyle = useAnimatedStyle(
    () => ({
      height: artHeightValue.value,
    }),
    [artHeightValue],
  );

  function resetTransientState() {
    setOtp("");
    setRecoveryOtp("");
    setRecoveryChallengeToken("");
    setRecoveryMaskedEmail("");
    setSubmitError(null);
  }

  function handleBackToPhoneForm() {
    setOtp("");
    setSubmitError(null);
    setStep("form");

    if (otpSession) {
      const nextSession = { ...otpSession, preferredPhase: "form" as const };
      setOtpSession(nextSession);
      void persistOtpSessionSafely(nextSession);
    }
  }

  function showPreviewAccess() {
    Keyboard.dismiss();
    resetTransientState();
    setOtpSession(null);
    void clearOtpSessionSafely();
    setStep("preview");
  }

  function handleBackFromPreview() {
    resetTransientState();
    setOtpSession(null);
    void clearOtpSessionSafely();
    setPhone("");
    setPhoneError(null);
    setStep("form");
  }

  async function requestPhoneOtp() {
    const challenge = await prepareOtp({
      phoneNumber: toE164Phone(phone),
    });
    const nextSession = createOtpChallengeSession(challenge);

    setOtpSession(nextSession);
    await persistOtpSessionSafely(nextSession);
    setClockNow(Date.now());
    setStep("otp");
    setOtp("");
  }

  async function handleContinue() {
    const digits = sanitizePhone(phone);

    if (digits.length !== 10) {
      setPhoneError("Enter a valid 10-digit phone number.");
      return;
    }

    setIsRequestingOtp(true);
    setSubmitError(null);

    try {
      const normalizedPhone = toE164Phone(digits);

      if (
        otpSession
        && otpSession.phoneNumber === normalizedPhone
        && isOtpChallengeSessionActive(otpSession)
      ) {
        const nextSession = { ...otpSession, preferredPhase: "otp" as const };
        setOtpSession(nextSession);
        await persistOtpSessionSafely(nextSession);
        setClockNow(Date.now());
        setOtp("");
        setStep("otp");
        return;
      }

      await requestPhoneOtp();
    } catch (error) {
      if (isPreviewAccessError(error)) {
        showPreviewAccess();
        return;
      }

      setSubmitError(
        error instanceof Error
          ? error.message
          : "Failed to send the verification code.",
      );
    } finally {
      setIsRequestingOtp(false);
    }
  }

  async function finishAuth(profile?: UserProfileDto | null) {
    setOtpSession(null);
    await clearOtpSessionSafely();
    const nextProfile = profile ?? (await getMe());
    await auth.refreshSession();
    router.replace(getNextRoute(nextProfile));
  }

  async function handleVerify() {
    if (verifyDisabled) {
      return;
    }

    if (!otpSession?.challengeToken) {
      setSubmitError("Request a fresh verification code and try again.");
      return;
    }

    setIsVerifyingOtp(true);
    setSubmitError(null);

    try {
      const result = await authClient.phoneNumber.verify({
        phoneNumber: toE164Phone(phone),
        code: otp,
        fetchOptions: {
          headers: {
            [challengeHeaderName]: otpSession.challengeToken,
          },
        },
      });

      if (result.error) {
        if (isPreviewAccessError(result.error)) {
          showPreviewAccess();
          return;
        }

        throw new Error(
          getBetterAuthErrorMessage(result.error, "Failed to verify the code."),
        );
      }

      await finishAuth();
    } catch (error) {
      if (isPreviewAccessError(error)) {
        showPreviewAccess();
        return;
      }

      if (error instanceof ApiError) {
        setSubmitError(error.message);
      } else {
        setSubmitError(
          error instanceof Error ? error.message : "Failed to verify the code.",
        );
      }
    } finally {
      setIsVerifyingOtp(false);
    }
  }

  async function handleResend() {
    if (resendCountdown > 0 || isRequestingOtp) {
      return;
    }

    setIsRequestingOtp(true);
    setSubmitError(null);

    try {
      await requestPhoneOtp();
    } catch (error) {
      if (isPreviewAccessError(error)) {
        showPreviewAccess();
        return;
      }

      setSubmitError(
        error instanceof Error
          ? error.message
          : "Failed to resend the verification code.",
      );
    } finally {
      setIsRequestingOtp(false);
    }
  }

  async function handleStartRecovery() {
    if (authIntent !== "signin" || isRequestingRecovery) {
      return;
    }

    setIsRequestingRecovery(true);
    setSubmitError(null);

    try {
      const response = await startSigninRecovery({
        phoneNumber: toE164Phone(phone),
      });

      setRecoveryChallengeToken(response.challengeToken);
      setRecoveryMaskedEmail(response.maskedEmail);
      setRecoveryOtp("");
      setStep("recoveryOtp");
    } catch (error) {
      if (isPreviewAccessError(error)) {
        showPreviewAccess();
        return;
      }

      setSubmitError(
        error instanceof Error
          ? error.message
          : "Failed to start account recovery.",
      );
    } finally {
      setIsRequestingRecovery(false);
    }
  }

  async function handleVerifyRecovery() {
    if (verifyRecoveryDisabled) {
      return;
    }

    if (!recoveryChallengeToken) {
      setSubmitError("Request a fresh recovery code and try again.");
      return;
    }

    setIsVerifyingRecovery(true);
    setSubmitError(null);

    try {
      const session = await verifySigninRecovery({
        challengeToken: recoveryChallengeToken,
        code: recoveryOtp,
        phoneNumber: toE164Phone(phone),
      });

      await finishAuth(session.user);
    } catch (error) {
      if (isPreviewAccessError(error)) {
        showPreviewAccess();
        return;
      }

      setSubmitError(
        error instanceof Error
          ? error.message
          : "Failed to verify the recovery code.",
      );
    } finally {
      setIsVerifyingRecovery(false);
    }
  }

  function renderForm() {
    return (
      <View style={styles.formBlock(isCompact)}>
        <View style={styles.formTop(isCompact)}>
          <View style={styles.copyBlock(isCompact)}>
            <Text style={styles.title(isCompact)}>Welcome to Stepwhere</Text>
            <Text style={styles.subtitle}>Enter your phone number.</Text>
          </View>
          {deletionNotice ? (
            <View style={styles.deletionNotice}>
              <AppIcon color={styles.deletionNoticeIcon.color} name="info" size={16} />
              <Text style={styles.deletionNoticeText}>
                {deletionNoticeScheduledFor
                  ? `Your deletion request can be cancelled until ${deletionNoticeScheduledFor}. Sign in before then to restore your account.`
                  : 'Your account has a pending deletion request. Sign in within the undo window to restore it.'}
              </Text>
            </View>
          ) : null}
          <View style={styles.fields(isCompact)}>
            <ArtAuthPhoneField
              compact={isCompact}
              error={phoneError}
              onChangeText={(value) => {
                setPhone(sanitizePhone(value));
                if (phoneError) {
                  setPhoneError(null);
                }
                if (submitError) {
                  setSubmitError(null);
                }
              }}
              value={phone}
            />
          </View>
          {submitError ? (
            <Text style={styles.errorText}>{submitError}</Text>
          ) : null}
        </View>
        <AuthActionButton
          compact={isCompact}
          disabled={isRequestingOtp}
          label={isRequestingOtp ? "Sending..." : "Continue"}
          onPress={() => {
            void handleContinue();
          }}
        />
      </View>
    );
  }

  function renderOtp() {
    return (
      <Animated.View
        entering={FadeInUp.duration(220)}
        exiting={FadeOutDown.duration(180)}
        style={styles.formBlock(isCompact)}
      >
        <View style={styles.formTop(isCompact)}>
          <Pressable
            accessibilityRole="button"
            onPress={handleBackToPhoneForm}
            style={({ pressed }) => [
              styles.changeRow,
              pressed && styles.changePressed,
            ]}
          >
            <AppIcon
              color={styles.changeIcon.color}
              name="arrow-left"
              size={16}
            />
            <Text style={styles.changeLabel}>Change</Text>
          </Pressable>
          <View style={styles.copyBlock(isCompact)}>
            <Text style={styles.title(isCompact)}>Enter code</Text>
            <Text
              style={styles.subtitle}
            >{`Sent to +91 ${phoneLabel || "98765 43210"}`}</Text>
          </View>
          <AuthOtpField
            autoFocus
            onChangeText={setOtp}
            ref={otpRef}
            value={otp}
          />
          {authIntent === "signin" ? (
            <Pressable
              accessibilityRole="button"
              disabled={isRequestingRecovery}
              onPress={() => {
                void handleStartRecovery();
              }}
              style={({ pressed }) => [
                styles.helpRow,
                pressed && styles.changePressed,
              ]}
            >
              <Text style={styles.helpText}>Trouble signing in?</Text>
            </Pressable>
          ) : null}
          {submitError ? (
            <Text style={styles.errorText}>{submitError}</Text>
          ) : null}
          <View style={styles.otpMeta}>
            <Text style={styles.resendText}>
              {resendCountdown > 0
                ? `Resend in ${resendCountdown}s`
                : "Need another code?"}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={resendCountdown > 0 || isRequestingOtp}
              onPress={() => {
                void handleResend();
              }}
              style={({ pressed }) => pressed && styles.changePressed}
            >
              <Text
                style={styles.resendLink(
                  resendCountdown > 0 || isRequestingOtp,
                )}
              >
                {isRequestingOtp ? "Sending..." : "Resend code"}
              </Text>
            </Pressable>
          </View>
        </View>
        <AuthActionButton
          compact={isCompact}
          disabled={verifyDisabled || isVerifyingOtp}
          label={isVerifyingOtp ? "Verifying..." : "Verify"}
          onPress={() => {
            void handleVerify();
          }}
        />
      </Animated.View>
    );
  }

  function renderRecoveryOtp() {
    return (
      <Animated.View
        entering={FadeInUp.duration(220)}
        exiting={FadeOutDown.duration(180)}
        style={styles.formBlock(isCompact)}
      >
        <View style={styles.formTop(isCompact)}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setSubmitError(null);
              setRecoveryOtp("");
              setStep("otp");
            }}
            style={({ pressed }) => [
              styles.changeRow,
              pressed && styles.changePressed,
            ]}
          >
            <AppIcon
              color={styles.changeIcon.color}
              name="arrow-left"
              size={16}
            />
            <Text style={styles.changeLabel}>Use phone code instead</Text>
          </Pressable>
          <View style={styles.copyBlock(isCompact)}>
            <Text style={styles.title(isCompact)}>Check your email</Text>
            <Text style={styles.subtitle}>
              {`We sent a code to ${recoveryMaskedEmail || "your email"}.`}
            </Text>
          </View>
          <AuthOtpField
            autoFocus
            onChangeText={setRecoveryOtp}
            ref={recoveryOtpRef}
            value={recoveryOtp}
          />
          {submitError ? (
            <Text style={styles.errorText}>{submitError}</Text>
          ) : null}
        </View>
        <AuthActionButton
          compact={isCompact}
          disabled={verifyRecoveryDisabled || isVerifyingRecovery}
          label={isVerifyingRecovery ? "Verifying..." : "Verify"}
          onPress={() => {
            void handleVerifyRecovery();
          }}
        />
      </Animated.View>
    );
  }

  function renderPreview() {
    return (
      <Animated.View
        entering={FadeInUp.duration(220)}
        exiting={FadeOutDown.duration(180)}
        style={styles.formBlock(false)}
      >
        <View style={styles.previewContent}>
          <View style={styles.previewIcon}>
            <AppIcon
              color={styles.previewIconColor.color}
              name="shield"
              size={24}
            />
          </View>
          <View style={styles.copyBlock(false)}>
            <Text style={styles.title(false)}>Stepwhere is in preview</Text>
            <Text style={styles.subtitle}>
              We&apos;re currently welcoming a small group of early testers. We&apos;re getting ready to make Stepwhere available to every family soon.
            </Text>
          </View>
        </View>
        <AuthActionButton
          compact={false}
          label="Back to sign in"
          onPress={handleBackFromPreview}
        />
      </Animated.View>
    );
  }

  if (isOtpSessionPending) {
    return <AppBootstrapScreen />;
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.stack(keyboard.visible, keyboard.height)}>
          <Animated.View style={[styles.artWrap, artContainerStyle]}>
            <Image
              contentFit="cover"
              contentPosition="center"
              source={thumbnailSource}
              style={styles.artImage}
              transition={180}
            />
          </Animated.View>

          <View style={styles.formArea(isCompact)}>
            {step === "form"
              ? renderForm()
              : step === "otp"
                ? renderOtp()
                : step === "recoveryOtp"
                  ? renderRecoveryOtp()
                  : renderPreview()}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create((theme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 16,
  },
  stack: (keyboardVisible: boolean, keyboardHeight: number) => ({
    flex: 1,
    gap: keyboardVisible ? 8 : 14,
    paddingTop: keyboardVisible ? 6 : 10,
    paddingBottom: keyboardVisible ? keyboardHeight + 8 : 10,
  }),
  artWrap: {
    overflow: "hidden",
    borderRadius: 24,
  },
  artImage: {
    width: "100%",
    height: "100%",
  },
  formArea: (compact: boolean) => ({
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 8,
    paddingTop: compact ? 0 : 4,
    paddingBottom: compact ? 4 : 8,
  }),
  formBlock: (compact: boolean) => ({
    flex: 1,
    justifyContent: "space-between",
    gap: compact ? 10 : 18,
  }),
  formTop: (compact: boolean) => ({
    gap: compact ? 10 : 16,
  }),
  copyBlock: (compact: boolean) => ({
    gap: compact ? 4 : 8,
  }),
  title: (compact: boolean) => ({
    color: theme.colors.background === "#000000" ? "#F7F4EF" : "#111111",
    fontFamily: theme.typography.family.display,
    fontSize: compact ? 22 : 28,
    lineHeight: compact ? 26 : 32,
    fontWeight: theme.typography.weight.semibold,
  }),
  subtitle: {
    color: theme.colors.background === "#000000" ? "#9C9690" : "#6F6A64",
    fontFamily: theme.typography.family.body,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: theme.typography.weight.regular,
  },
  fields: (compact: boolean) => ({
    gap: compact ? 10 : 14,
  }),
  changeRow: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  changePressed: {
    opacity: 0.72,
  },
  changeIcon: {
    color: theme.colors.background === "#000000" ? "#9C9690" : "#6F6A64",
  },
  changeLabel: {
    color: theme.colors.background === "#000000" ? "#9C9690" : "#6F6A64",
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: theme.typography.weight.medium,
  },
  helpRow: {
    alignSelf: "flex-start",
  },
  helpText: {
    color: theme.colors.background === "#000000" ? "#F7F4EF" : "#151313",
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: theme.typography.weight.semibold,
  },
  otpMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  resendText: {
    color: theme.colors.background === "#000000" ? "#9C9690" : "#6F6A64",
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 18,
  },
  resendLink: (disabled: boolean) => ({
    color: disabled
      ? theme.colors.textMuted
      : theme.colors.background === "#000000"
        ? "#F7F4EF"
        : "#151313",
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: theme.typography.weight.semibold,
  }),
  errorText: {
    color: theme.colors.alertText,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: theme.typography.weight.medium,
  },
  // Informational, not an error: the deletion is still cancellable here.
  deletionNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surfaceMuted,
  },
  deletionNoticeIcon: {
    color: theme.colors.textSecondary,
  },
  deletionNoticeText: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.body,
  },
  previewContent: {
    gap: theme.spacing[4],
  },
  previewIcon: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.cardSmall,
    backgroundColor: theme.colors.surfaceMuted,
  },
  previewIconColor: {
    color: theme.colors.textSecondary,
  },
}));
