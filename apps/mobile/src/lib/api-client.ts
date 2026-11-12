import type {
  ActivityPeriod,
  AccountDeletionChallengeDto,
  AccountDeletionConfirmationDto,
  AccountDeletionImpactDto,
  AddressPlaceSuggestionDto,
  ActiveShareLinkResponseDto,
  ApiErrorDto,
  ApiSuccessDto,
  ChildDetailDto,
  ChildActivityResponseDto,
  ArchiveChildResultDto,
  BindChildDeviceInput,
  BindChildDeviceResultDto,
  ChildGeofenceDto,
  ChildHistoryDayResponseDto,
  ChildHistoryRangeResponseDto,
  ChildTrailGeometryRequestMode,
  ChildTrailResponseDto,
  CreateShareLinkInput,
  CreateChildAvatarUploadIntentInput,
  CreateChildAvatarUploadIntentResponseDto,
  CreateUserAvatarUploadIntentInput,
  CreateUserAvatarUploadIntentResponseDto,
  CreateChildInput,
  DeviceReservationDto,
  FamilyQrInviteDto,
  LeaveFamilyResultDto,
  FamilyMemberDto,
  NotificationInboxResponseDto,
  PlaceDto,
  PublicFamilyInvitePreviewDto,
  RegisterPushInstallationInput,
  RemoveFamilyMemberResultDto,
  ResolveSchoolPlaceInput,
  ResolveAddressPlaceInput,
  RevokedShareLinkDto,
  ResolvedAddressDto,
  OverviewResponseDto,
  MobileRealtimeEvent,
  PrepareOtpInput,
  PrepareOtpResponseDto,
  ShareLinkDto,
  SchoolPlaceSuggestionDto,
  JoinFamilyResponseDto,
  JoinFamilyPreviewResponseDto,
  StartSigninRecoveryInput,
  StartSigninRecoveryResponseDto,
  StartFamilyResponseDto,
  UnlinkChildDeviceResultDto,
  UpdateChildInput,
  UpdateChildGeofenceInput,
  UpdateMeInput,
  UserProfileDto,
  VerifySigninRecoveryInput,
  VerifySigninRecoveryResponseDto,
  VerifyGoogleEmailInput,
  ConfirmAccountDeletionInput,
} from "@stepwhere/types";
import { getSetCookie } from "@better-auth/expo/client";

import { File, UploadTask, UploadType } from "expo-file-system";
import * as SecureStore from "expo-secure-store";

import { authClient } from "./auth-client";
import { getSessionTokenFromCookie } from "./realtime-auth";

//TODO: Check whether the process env is working properly
const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8223";
const AUTH_COOKIE_STORAGE_KEY = "stepwhere_cookie";
const DEFAULT_QUERY_TIMEOUT_MS = 12_000;
const DEFAULT_MUTATION_TIMEOUT_MS = 20_000;

type UnauthorizedHandler = (() => Promise<void> | void) | null;

let unauthorizedHandler: UnauthorizedHandler = null;

export type ApiRequestOptions = {
  operationName: string;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export class ApiError extends Error {
  readonly code?: string;
  readonly details?: unknown;
  readonly status: number;

  constructor(status: number, payload?: ApiErrorDto) {
    super(payload?.message ?? `Request failed with status ${status}.`);
    this.name = "ApiError";
    this.status = status;
    this.code = payload?.code;
    this.details = payload?.details;
  }
}

export function setApiUnauthorizedHandler(handler: UnauthorizedHandler) {
  unauthorizedHandler = handler;
}

function getRealtimeBaseUrl() {
  if (apiBaseUrl.startsWith("https://")) {
    return apiBaseUrl.replace("https://", "wss://");
  }

  return apiBaseUrl.replace("http://", "ws://");
}

async function parseJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  return JSON.parse(text) as T;
}

async function persistAuthSetCookie(setCookieHeader: string | null) {
  if (!setCookieHeader) {
    return;
  }

  const previousCookieJson = await SecureStore.getItemAsync(AUTH_COOKIE_STORAGE_KEY);
  const nextCookieJson = getSetCookie(setCookieHeader, previousCookieJson ?? undefined);
  await SecureStore.setItemAsync(AUTH_COOKIE_STORAGE_KEY, nextCookieJson);
}

function createRequestSignal(input: RequestInit | undefined, options: ApiRequestOptions | undefined) {
  const timeoutMs = options?.timeoutMs ?? (input?.method && input.method !== "GET"
    ? DEFAULT_MUTATION_TIMEOUT_MS
    : DEFAULT_QUERY_TIMEOUT_MS);

  if (!options?.signal && timeoutMs <= 0) {
    return {
      cleanup: () => undefined,
      signal: undefined,
    };
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = setTimeout(abort, timeoutMs);
  const upstreamSignal = options?.signal;

  if (upstreamSignal?.aborted) {
    controller.abort();
  } else if (upstreamSignal) {
    upstreamSignal.addEventListener("abort", abort, { once: true });
  }

  return {
    cleanup: () => {
      clearTimeout(timeout);
      if (upstreamSignal) {
        upstreamSignal.removeEventListener("abort", abort);
      }
    },
    signal: controller.signal,
  };
}

async function apiRequest<T>(path: string, init?: RequestInit, options?: ApiRequestOptions): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("accept", "application/json");

  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const cookie = authClient.getCookie();
  if (cookie) {
    headers.set("cookie", cookie);
  }

  const startedAt = Date.now();
  const requestSignal = createRequestSignal(init, options);

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      credentials: "omit",
      headers,
      signal: requestSignal.signal,
    });
  } catch (error) {
    requestSignal.cleanup();

    if (__DEV__) {
      console.info("[api]", {
        durationMs: Date.now() - startedAt,
        operationName: options?.operationName ?? path,
        path,
        status: "network-error",
      });
    }

    throw error;
  }

  requestSignal.cleanup();

  if (__DEV__) {
    console.info("[api]", {
      durationMs: Date.now() - startedAt,
      operationName: options?.operationName ?? path,
      path,
      status: response.status,
    });
  }

  if (!response.ok) {
    const payload = await parseJson<ApiErrorDto>(response);

    if (response.status === 401 && unauthorizedHandler) {
      await unauthorizedHandler();
    }

    throw new ApiError(response.status, payload ?? undefined);
  }

  const payload = await parseJson<ApiSuccessDto<T>>(response);

  if (!payload) {
    throw new Error("Server returned an empty response body.");
  }

  return payload.data;
}

export function getMe(options?: ApiRequestOptions) {
  return apiRequest<UserProfileDto>("/v1/me", undefined, options);
}

export function getAccountDeletionImpact(options?: ApiRequestOptions) {
  return apiRequest<AccountDeletionImpactDto>("/v1/me/account-deletion/impact", undefined, options);
}

export function requestAccountDeletionChallenge(options?: ApiRequestOptions) {
  return apiRequest<AccountDeletionChallengeDto>("/v1/me/account-deletion/challenges", {
    method: "POST",
  }, options);
}

export function confirmAccountDeletion(input: ConfirmAccountDeletionInput, options?: ApiRequestOptions) {
  return apiRequest<AccountDeletionConfirmationDto>("/v1/me/account-deletion/confirm", {
    method: "POST",
    body: JSON.stringify(input),
  }, options);
}

export function getOverview(options?: ApiRequestOptions) {
  return apiRequest<OverviewResponseDto>("/v1/overview", undefined, options);
}

export function getChildTrail(
  childId: string,
  input?: { distanceMeters?: number; geometry?: ChildTrailGeometryRequestMode },
  options?: ApiRequestOptions,
) {
  const search = new URLSearchParams();

  if (input?.distanceMeters != null) {
    search.set("distanceMeters", String(input.distanceMeters));
  }

  if (input?.geometry) {
    search.set("geometry", input.geometry);
  }

  const query = search.toString();
  return apiRequest<ChildTrailResponseDto>(`/v1/children/${childId}/trail${query ? `?${query}` : ""}`, undefined, options);
}

export function getChildActivity(input: {
  childId: string;
  endDate: string;
  period: ActivityPeriod;
  startDate: string;
  timezone: string;
}, options?: ApiRequestOptions) {
  const search = new URLSearchParams({
    endDate: input.endDate,
    period: input.period,
    startDate: input.startDate,
    timezone: input.timezone,
  });

  return apiRequest<ChildActivityResponseDto>(
    `/v1/children/${input.childId}/activity?${search.toString()}`,
    undefined,
    options,
  );
}

export function getChildHistoryRange(input: {
  childId: string;
  timezone: string;
}, options?: ApiRequestOptions) {
  const search = new URLSearchParams({
    timezone: input.timezone,
  });

  return apiRequest<ChildHistoryRangeResponseDto>(
    `/v1/children/${input.childId}/history/range?${search.toString()}`,
    undefined,
    options,
  );
}

export function getChildHistoryDay(input: {
  childId: string;
  date: string;
  timezone: string;
}, options?: ApiRequestOptions) {
  const search = new URLSearchParams({
    date: input.date,
    timezone: input.timezone,
  });

  return apiRequest<ChildHistoryDayResponseDto>(
    `/v1/children/${input.childId}/history/day?${search.toString()}`,
    undefined,
    options,
  );
}

export function getFamilyMembers(options?: ApiRequestOptions) {
  return apiRequest<FamilyMemberDto[]>("/v1/family/members", undefined, options);
}

export function createChildShareLink(childId: string, input: CreateShareLinkInput, options?: ApiRequestOptions) {
  return apiRequest<ShareLinkDto>(`/v1/children/${childId}/share-links`, {
    method: "POST",
    body: JSON.stringify(input),
  }, options);
}

export function getActiveChildShareLink(childId: string, options?: ApiRequestOptions) {
  return apiRequest<ActiveShareLinkResponseDto>(
    `/v1/children/${childId}/share-links/active`,
    undefined,
    options,
  );
}

export function revokeChildShareLink(
  childId: string,
  shareId: string,
  options?: ApiRequestOptions,
) {
  return apiRequest<RevokedShareLinkDto>(
    `/v1/children/${childId}/share-links/${shareId}`,
    { method: "DELETE" },
    options,
  );
}

export function updateMe(input: UpdateMeInput, options?: ApiRequestOptions) {
  return apiRequest<UserProfileDto>("/v1/me", {
    method: "PATCH",
    body: JSON.stringify(input),
  }, options);
}

export function verifyGoogleEmail(input: VerifyGoogleEmailInput, options?: ApiRequestOptions) {
  return apiRequest<UserProfileDto>("/v1/auth/google-email/verify", {
    method: "POST",
    body: JSON.stringify(input),
  }, options);
}

export function prepareOtp(input: PrepareOtpInput) {
  return apiRequest<PrepareOtpResponseDto>("/v1/auth/prepare-otp", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function startSigninRecovery(input: StartSigninRecoveryInput) {
  return apiRequest<StartSigninRecoveryResponseDto>("/v1/auth/signin-recovery/start", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function verifySigninRecovery(input: VerifySigninRecoveryInput) {
  const headers = new Headers({
    accept: "application/json",
    "content-type": "application/json",
  });
  const cookie = authClient.getCookie();

  if (cookie) {
    headers.set("cookie", cookie);
  }

  const response = await fetch(`${apiBaseUrl}/v1/auth/signin-recovery/verify`, {
    method: "POST",
    credentials: "omit",
    headers,
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const payload = await parseJson<ApiErrorDto>(response);
    throw new ApiError(response.status, payload ?? undefined);
  }

  await persistAuthSetCookie(response.headers.get("set-cookie"));
  const payload = await parseJson<ApiSuccessDto<VerifySigninRecoveryResponseDto>>(response);

  if (!payload) {
    throw new Error("Server returned an empty response body.");
  }

  return payload.data;
}

export function startFamily() {
  return apiRequest<StartFamilyResponseDto>("/v1/onboarding/start-family", {
    method: "POST",
  });
}

export function joinFamily(input: { token: string }) {
  return apiRequest<JoinFamilyResponseDto>("/v1/onboarding/join-family", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function previewJoinFamilyToken(token: string, options?: ApiRequestOptions) {
  const query = new URLSearchParams({ token });
  return apiRequest<JoinFamilyPreviewResponseDto>(`/v1/onboarding/join-family/preview?${query.toString()}`, undefined, options);
}

export function createChild(input: CreateChildInput) {
  return apiRequest<ChildDetailDto>("/v1/children", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getChild(childId: string, options?: ApiRequestOptions) {
  return apiRequest<ChildDetailDto>(`/v1/children/${childId}`, undefined, options);
}

export function updateChild(childId: string, input: UpdateChildInput, options?: ApiRequestOptions) {
  return apiRequest<ChildDetailDto>(`/v1/children/${childId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }, options);
}

export function unlinkChildDevice(childId: string, options?: ApiRequestOptions) {
  return apiRequest<UnlinkChildDeviceResultDto>(`/v1/children/${childId}/device-binding`, {
    method: "DELETE",
  }, options);
}

export function bindChildDevice(childId: string, input: BindChildDeviceInput, options?: ApiRequestOptions) {
  return apiRequest<BindChildDeviceResultDto>(`/v1/children/${childId}/device-binding`, {
    method: "POST",
    body: JSON.stringify(input),
  }, options);
}

export function archiveChild(childId: string, options?: ApiRequestOptions) {
  return apiRequest<ArchiveChildResultDto>(`/v1/children/${childId}`, {
    method: "DELETE",
  }, options);
}

export function searchSchoolPlaces(query: string, sessionToken?: string, options?: ApiRequestOptions) {
  const search = new URLSearchParams({ query });

  if (sessionToken) {
    search.set("sessionToken", sessionToken);
  }

  return apiRequest<SchoolPlaceSuggestionDto[]>(
    `/v1/places/schools/autocomplete?${search.toString()}`,
    undefined,
    options,
  );
}

export function resolveSchoolPlace(input: ResolveSchoolPlaceInput, options?: ApiRequestOptions) {
  return apiRequest<PlaceDto>("/v1/places/schools/resolve", {
    method: "POST",
    body: JSON.stringify(input),
  }, options);
}

export function searchAddressPlaces(query: string, sessionToken?: string, options?: ApiRequestOptions) {
  const search = new URLSearchParams({ query });

  if (sessionToken) {
    search.set("sessionToken", sessionToken);
  }

  return apiRequest<AddressPlaceSuggestionDto[]>(
    `/v1/places/addresses/autocomplete?${search.toString()}`,
    undefined,
    options,
  );
}

export function resolveAddressPlace(input: ResolveAddressPlaceInput, options?: ApiRequestOptions) {
  return apiRequest<ResolvedAddressDto>("/v1/places/addresses/resolve", {
    method: "POST",
    body: JSON.stringify(input),
  }, options);
}

export function previewPublicFamilyInvite(token: string, options?: ApiRequestOptions) {
  const search = new URLSearchParams({ token });
  return apiRequest<PublicFamilyInvitePreviewDto>(
    `/v1/public/family-invites/preview?${search.toString()}`,
    undefined,
    options,
  );
}

export function getChildGeofence(childId: string) {
  return apiRequest<ChildGeofenceDto>(`/v1/children/${childId}/geofence`);
}

export function updateChildGeofence(
  childId: string,
  input: UpdateChildGeofenceInput,
  options?: ApiRequestOptions,
) {
  return apiRequest<ChildGeofenceDto>(`/v1/children/${childId}/geofence`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }, options);
}

export function resetChildGeofence(childId: string, options?: ApiRequestOptions) {
  return apiRequest<ChildGeofenceDto>(`/v1/children/${childId}/geofence/reset`, {
    method: "POST",
  }, options);
}

export function getNotifications(input?: {
  cursor?: string | null;
  limit?: number;
}, options?: ApiRequestOptions) {
  const search = new URLSearchParams();

  if (input?.cursor) {
    search.set("cursor", input.cursor);
  }

  if (input?.limit != null) {
    search.set("limit", String(input.limit));
  }

  const query = search.toString();
  return apiRequest<NotificationInboxResponseDto>(`/v1/notifications${query ? `?${query}` : ""}`, undefined, options);
}

export function getUnreadNotificationCount(options?: ApiRequestOptions) {
  return apiRequest<{ unreadCount: number }>("/v1/notifications/unread-count", undefined, options);
}

export function createFamilyQrInvite(options?: ApiRequestOptions) {
  return apiRequest<FamilyQrInviteDto>("/v1/family/qr-invites", {
    method: "POST",
    body: JSON.stringify({}),
  }, options);
}

export function removeFamilyMember(memberId: string, options?: ApiRequestOptions) {
  return apiRequest<RemoveFamilyMemberResultDto>(`/v1/family/members/${memberId}/remove`, {
    method: "POST",
  }, options);
}

export function leaveFamily(options?: ApiRequestOptions) {
  return apiRequest<LeaveFamilyResultDto>("/v1/family/leave", {
    method: "POST",
  }, options);
}

export function markNotificationRead(notificationId: string, options?: ApiRequestOptions) {
  return apiRequest<{ read: boolean }>(`/v1/notifications/${notificationId}/read`, {
    method: "PATCH",
  }, options);
}

export function markAllNotificationsRead(options?: ApiRequestOptions) {
  return apiRequest<{ read: boolean }>("/v1/notifications/read-all", {
    method: "POST",
  }, options);
}

export function registerCurrentPushInstallation(input: RegisterPushInstallationInput) {
  return apiRequest<RegisterPushInstallationInput>("/v1/me/push-installations/current", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deletePushInstallation(installationId: string) {
  return apiRequest<{ installationId: string; deleted: boolean }>(`/v1/me/push-installations/${encodeURIComponent(installationId)}`, {
    method: "DELETE",
  });
}

export function reserveDevice(input: { hardwareIdentifier: string }) {
  return apiRequest<DeviceReservationDto>("/v1/onboarding/device-reservations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function releaseDeviceReservation() {
  return apiRequest<{ released: boolean }>("/v1/onboarding/device-reservations/current", {
    method: "DELETE",
  });
}

export function createChildAvatarUploadIntent(input: CreateChildAvatarUploadIntentInput) {
  return apiRequest<CreateChildAvatarUploadIntentResponseDto>("/v1/uploads/child-avatar-intents", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createUserAvatarUploadIntent(input: CreateUserAvatarUploadIntentInput) {
  return apiRequest<CreateUserAvatarUploadIntentResponseDto>("/v1/uploads/user-avatar-intents", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function uploadToSignedUrl(input: {
  contentType: string;
  fileName?: string;
  signedUrl: string;
  uri: string;
}) {
  // React Native's fetch does not support Blob / ArrayBuffer as a request body.
  // Use the SDK 56 UploadTask which streams the file natively from disk.
  const file = new File(input.uri);
  const task = new UploadTask(file, input.signedUrl, {
    httpMethod: "PUT",
    uploadType: UploadType.BINARY_CONTENT,
    headers: {
      "content-type": input.contentType,
    },
  });

  const result = await task.uploadAsync();

  if (result.status < 200 || result.status >= 300) {
    throw new Error("Failed to upload the photo.");
  }
}

export type OverviewSocketEvent = MobileRealtimeEvent;

export function connectOverviewSocket(handlers: {
  onClose?: (event: WebSocketCloseEvent) => void;
  onError?: (error: Event) => void;
  onMessage: (event: OverviewSocketEvent) => void;
  onOpen?: () => void;
}) {
  const token = getSessionTokenFromCookie(authClient.getCookie());
  const socketUrl = token
    ? `${getRealtimeBaseUrl()}/v1/realtime/ws?token=${encodeURIComponent(token)}`
    : `${getRealtimeBaseUrl()}/v1/realtime/ws`;
  const socket = new WebSocket(socketUrl);

  if (__DEV__) {
    console.info("[realtime] connecting", {
      hasToken: Boolean(token),
      url: `${getRealtimeBaseUrl()}/v1/realtime/ws`,
    });
  }

  socket.onopen = () => {
    if (__DEV__) {
      console.info("[realtime] open");
    }
    handlers.onOpen?.();
  };

  socket.onmessage = (event) => {
    try {
      const parsedEvent = JSON.parse(String(event.data)) as OverviewSocketEvent;
      if (__DEV__) {
        console.info("[realtime] message", {
          type: parsedEvent.type,
        });
      }
      handlers.onMessage(parsedEvent);
    } catch (error) {
      if (__DEV__) {
        console.warn("Failed to parse realtime payload", error);
      }
    }
  };
  socket.onclose = (event) => {
    if (__DEV__) {
      console.info("[realtime] close", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
    }
    handlers.onClose?.(event);
  };
  socket.onerror = (event) => {
    if (__DEV__) {
      console.warn("[realtime] error");
    }
    handlers.onError?.(event);
  };

  return {
    close: () => {
      socket.close();
    },
  };
}

export type WebSocketCloseEvent = {
  code?: number;
  reason?: string;
  wasClean?: boolean;
};
