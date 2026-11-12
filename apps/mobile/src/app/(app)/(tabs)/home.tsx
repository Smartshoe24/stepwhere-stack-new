import { BlurTargetView } from "expo-blur";
import { StatusBar } from "expo-status-bar";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from "expo-router";
import type MapViewType from "react-native-maps";
import type { LatLng, Region } from "react-native-maps";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  Share,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import {
  TELEMETRY_OFFLINE_AFTER_MS,
  type ChildGeofenceDto,
  type ChildLiveResponseDto,
  type ChildTrailResponseDto,
  type OverviewChildDto,
  type OverviewResponseDto,
  type ShareDurationMinutes,
} from "@stepwhere/types";

import type { ThemeToggleOrigin } from "@/components/icons/animated/animated-theme-toggle";
import { GeofenceRadiusEditorCard } from "@/components/home/geofence-radius-editor-card";
import type { GeofenceRadiusCommit } from "@/components/home/geofence-radius-drag-state";
import { GeofenceStatusCard } from "@/components/home/geofence-status-card";
import {
  clampGeofenceRadius,
  createDefaultGeofenceState,
  DEFAULT_GEOFENCE_RADIUS_METERS,
  type ChildGeofenceState,
  type GeofenceUiStatus,
  type GeofenceRadiusUnit,
  toGeofenceState,
} from "@/components/home/geofence-state";
import { AppTabChrome } from "@/components/layout/app-child-top-chrome";
import { useTabChrome } from "@/components/layout/tab-chrome-context";
import { ShoeLoader } from "@/components/loading/shoe-loader";
import type { LiveTrailSample } from "@/components/home/movement-trail-geometry";
import { PastelMap } from "@/components/home/pastel-map";
import {
  formatShareDurationLabel,
  type ShareSheetMode,
  ShareDurationSheet,
} from "@/components/home/share-duration-sheet";
import { TelemetryBar } from "@/components/home/telemetry-bar";
import { useGeofenceRadiusDrag } from "@/components/home/use-geofence-radius-drag";
import { FirstLocationGate } from "@/components/location/first-location-gate";
import { useNativeTabVisibility } from "@/components/navigation/native-tab-visibility";
import { AppIcon } from "@/components/ui/app-icon";
import { getRuntimeThemeName } from "@/components/theme/switch-runtime-theme";
import { useThemeTransition } from "@/components/theme/use-theme-transition";
import { useAuth } from "@/features/auth/use-auth";
import {
  useMobileRealtimeConnectionRevision,
  useMobileRealtimeEvent,
} from "@/features/realtime/mobile-realtime-provider";
import {
  DEFAULT_CHILD_COORDINATES,
  toOverviewChildCard,
  type OverviewChildCard,
} from "@/features/overview/overview-ui";
import {
  getNextTrailRetryDelayMs,
  shouldRetryTrailRefresh,
  shouldScheduleTrailRefresh,
} from "@/features/overview/trail-refresh";
import {
  ApiError,
  createChildShareLink,
  getOverview,
  getChildTrail,
  resetChildGeofence,
  revokeChildShareLink,
  updateChildGeofence,
} from "@/lib/api-client";
import { useStableCallback } from "@/lib/use-stable-callback";
import {
  prefetchFamilyMembers,
  useActiveChildShareQuery,
  useOverviewQuery,
} from "@/query/hooks";
import { queryKeys } from "@/query/query-keys";

const defaultRegion: Region = {
  latitude: DEFAULT_CHILD_COORDINATES.latitude,
  longitude: DEFAULT_CHILD_COORDINATES.longitude,
  latitudeDelta: 24,
  longitudeDelta: 20,
};

const CHROME_HIDE_DURATION = 220;
const CHROME_SHOW_DURATION = 190;
const MAP_INTERACTION_RESTORE_DELAY = 180;
const MAP_TAP_GUARD_MS = 260;
const MAP_FULLSCREEN_TRANSITION_MS = CHROME_HIDE_DURATION;
const TRAIL_DISTANCE_METERS = 2000;
const TRAIL_REFRESH_THROTTLE_MS = 30_000;
const LIVE_TRAIL_SAMPLE_LIMIT = 32;
const LIVE_TRAIL_SAMPLE_MAX_AGE_MS = 5 * 60 * 1000;
const DEFAULT_TOP_BAR_HEIGHT = 68;
const DEFAULT_SECONDARY_TOP_CHROME_HEIGHT = 64;
const DEFAULT_TELEMETRY_HEIGHT = 60;
const DEFAULT_SUMMARY_HEIGHT = 116;
const THEME_TRANSITION_SETTLE_DELAY_MS_HOME = 90;
const MIN_GEOFENCE_FRAMING_RADIUS_METERS = 150;
const GEOFENCE_FIT_THROTTLE_MS = 320;
const GEOFENCE_EDGE_PADDING_HORIZONTAL = 32;
const GEOFENCE_EDGE_PADDING_VERTICAL = 24;
const HOME_MAP_RESUME_DELAY_MS = 120;
const IOS_NATIVE_TAB_BAR_HEIGHT = 20;
const HOME_BOTTOM_CHROME_GAP = 12;
const HOME_OVERVIEW_RECONCILE_INTERVAL_MS = 30_000;
const HOME_LIVE_SHARING_ENABLED: boolean = true;
/** Stable identity for the "no live samples" case, so memoized children bail out. */
const EMPTY_LIVE_TRAIL_SAMPLES: LiveTrailSample[] = [];

function nowMs() {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}

function getChildRegion(
  child: OverviewChildCard,
  zoom: "default" | "focused",
): Region {
  return {
    latitude: child.latitude ?? DEFAULT_CHILD_COORDINATES.latitude,
    longitude: child.longitude ?? DEFAULT_CHILD_COORDINATES.longitude,
    latitudeDelta: zoom === "focused" ? 0.012 : 0.032,
    longitudeDelta: zoom === "focused" ? 0.012 : 0.022,
  };
}

function getSelectedChildCenter(child: OverviewChildCard) {
  return {
    latitude: child.latitude ?? DEFAULT_CHILD_COORDINATES.latitude,
    longitude: child.longitude ?? DEFAULT_CHILD_COORDINATES.longitude,
  };
}

function getLastSeenAtMs(child: { lastSeenAt: string | null }) {
  if (!child.lastSeenAt) {
    return Number.NaN;
  }

  return Date.parse(child.lastSeenAt);
}

function isGeofenceResetLocationFresh(
  lastSeenAt: string | null,
  now: number,
) {
  if (!lastSeenAt) {
    return false;
  }

  const lastSeenAtMs = Date.parse(lastSeenAt);
  return Number.isFinite(lastSeenAtMs)
    && now - lastSeenAtMs <= TELEMETRY_OFFLINE_AFTER_MS;
}

function isOlderChildTelemetry(
  current: { lastSeenAt: string | null },
  incoming: { lastSeenAt: string | null },
) {
  const currentLastSeenAtMs = getLastSeenAtMs(current);
  const incomingLastSeenAtMs = getLastSeenAtMs(incoming);

  if (!Number.isFinite(currentLastSeenAtMs)) {
    return false;
  }

  return !Number.isFinite(incomingLastSeenAtMs)
    || incomingLastSeenAtMs < currentLastSeenAtMs;
}

function mergeChildUpdateIntoOverview(
  overview: OverviewResponseDto,
  childUpdate: ChildLiveResponseDto["child"],
) {
  const childIndex = overview.children.findIndex(
    (child) => child.id === childUpdate.id,
  );

  if (childIndex < 0) {
    return overview;
  }

  const currentChild = overview.children[childIndex];
  if (isOlderChildTelemetry(currentChild, childUpdate)) {
    return overview;
  }

  const children = [...overview.children];
  children[childIndex] = {
    ...currentChild,
    ...childUpdate,
    geofence: currentChild.geofence,
  };

  return { ...overview, children };
}

function createOptimisticDisabledGeofence(
  geofence: ChildGeofenceDto,
): ChildGeofenceDto {
  return {
    ...geofence,
    status: "disabled",
    containmentState: "unknown",
    breachedAt: null,
    lastDistanceMeters: null,
    lastEvaluatedAt: null,
  };
}

function createOptimisticEnabledGeofence(
  geofence: ChildGeofenceDto,
  input: {
    centerLatitude: number;
    centerLongitude: number;
    radiusMeters: number;
  },
): ChildGeofenceDto {
  return {
    ...geofence,
    status: "enabled",
    containmentState: "unknown",
    centerLatitude: input.centerLatitude,
    centerLongitude: input.centerLongitude,
    radiusMeters: input.radiusMeters,
    breachedAt: null,
    lastDistanceMeters: null,
    lastEvaluatedAt: null,
  };
}

function createOptimisticResetGeofence(
  geofence: ChildGeofenceDto,
  input: {
    centerLatitude: number;
    centerLongitude: number;
    occurredAt: string;
  },
): ChildGeofenceDto {
  return {
    ...geofence,
    status: "enabled",
    containmentState: "inside",
    centerLatitude: input.centerLatitude,
    centerLongitude: input.centerLongitude,
    radiusMeters: geofence.radiusMeters,
    breachedAt: null,
    lastDistanceMeters: 0,
    lastEvaluatedAt: input.occurredAt,
  };
}

type GeofenceTransactionPhase = "pending" | "confirmed";

type GeofenceTransactionAction = "disable" | "save" | "reset";

type GeofenceTransaction = {
  action: GeofenceTransactionAction;
  childId: string;
  mutationId: string;
  phase: GeofenceTransactionPhase;
  optimisticGeofence: ChildGeofenceDto;
  previousDraft: ChildGeofenceState | null;
  previousGeofence: ChildGeofenceDto;
  serverGeofence: ChildGeofenceDto | null;
  startedAt: number;
};

type GeofenceStaleGuard = {
  childId: string;
  geofence: ChildGeofenceDto;
  minimumUpdatedAt: string;
};

type GeofenceUiState = {
  staleGuardsByChildId: Record<string, GeofenceStaleGuard>;
  transactionsByChildId: Record<string, GeofenceTransaction>;
};

type GeofenceUiAction =
  | {
      type: "begin";
      transaction: GeofenceTransaction;
    }
  | {
      type: "complete";
      childId: string;
      mutationId: string;
    }
  | {
      type: "confirm";
      childId: string;
      mutationId: string;
      serverGeofence: ChildGeofenceDto;
    }
  | {
      type: "install-stale-guard";
      childId: string;
      geofence: ChildGeofenceDto;
    }
  | {
      type: "rollback";
      childId: string;
      mutationId: string;
    };

const initialGeofenceUiState: GeofenceUiState = {
  staleGuardsByChildId: {},
  transactionsByChildId: {},
};

function getTransactionDisplayGeofence(
  transaction: GeofenceTransaction | undefined,
) {
  if (!transaction) {
    return null;
  }

  if (transaction.phase === "confirmed" && transaction.serverGeofence) {
    return transaction.serverGeofence;
  }

  return transaction.optimisticGeofence;
}

function geofenceUiReducer(
  state: GeofenceUiState,
  action: GeofenceUiAction,
): GeofenceUiState {
  switch (action.type) {
    case "begin":
      return {
        ...state,
        transactionsByChildId: {
          ...state.transactionsByChildId,
          [action.transaction.childId]: action.transaction,
        },
      };
    case "confirm": {
      const transaction = state.transactionsByChildId[action.childId];

      if (!transaction || transaction.mutationId !== action.mutationId) {
        return state;
      }

      return {
        ...state,
        transactionsByChildId: {
          ...state.transactionsByChildId,
          [action.childId]: {
            ...transaction,
            phase: "confirmed",
            serverGeofence: action.serverGeofence,
          },
        },
      };
    }
    case "install-stale-guard":
      if (!action.geofence.updatedAt) {
        return state;
      }

      return {
        ...state,
        staleGuardsByChildId: {
          ...state.staleGuardsByChildId,
          [action.childId]: {
            childId: action.childId,
            geofence: action.geofence,
            minimumUpdatedAt: action.geofence.updatedAt,
          },
        },
      };
    case "complete": {
      const transaction = state.transactionsByChildId[action.childId];

      if (!transaction || transaction.mutationId !== action.mutationId) {
        return state;
      }

      const nextTransactions = { ...state.transactionsByChildId };
      delete nextTransactions[action.childId];

      return {
        ...state,
        transactionsByChildId: nextTransactions,
      };
    }
    case "rollback": {
      const transaction = state.transactionsByChildId[action.childId];

      if (!transaction || transaction.mutationId !== action.mutationId) {
        return state;
      }

      const nextTransactions = { ...state.transactionsByChildId };
      delete nextTransactions[action.childId];

      return {
        ...state,
        transactionsByChildId: nextTransactions,
      };
    }
    default:
      return state;
  }
}

const EARTH_RADIUS_METERS = 6371000;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function getDestinationCoordinate(
  latitude: number,
  longitude: number,
  distanceMeters: number,
  bearingDegrees: number,
): LatLng {
  const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
  const latitudeRadians = toRadians(latitude);
  const longitudeRadians = toRadians(longitude);
  const bearingRadians = toRadians(bearingDegrees);
  const destinationLatitude = Math.asin(
    Math.sin(latitudeRadians) * Math.cos(angularDistance) +
      Math.cos(latitudeRadians) *
        Math.sin(angularDistance) *
        Math.cos(bearingRadians),
  );
  const destinationLongitude =
    longitudeRadians +
    Math.atan2(
      Math.sin(bearingRadians) *
        Math.sin(angularDistance) *
        Math.cos(latitudeRadians),
      Math.cos(angularDistance) -
        Math.sin(latitudeRadians) * Math.sin(destinationLatitude),
    );

  return {
    latitude: toDegrees(destinationLatitude),
    longitude: toDegrees(destinationLongitude),
  };
}

function getGeofenceBoundaryCoordinates(
  latitude: number,
  longitude: number,
  radiusMeters: number,
): LatLng[] {
  return [
    getDestinationCoordinate(latitude, longitude, radiusMeters, 0),
    getDestinationCoordinate(latitude, longitude, radiusMeters, 45),
    getDestinationCoordinate(latitude, longitude, radiusMeters, 90),
    getDestinationCoordinate(latitude, longitude, radiusMeters, 135),
    getDestinationCoordinate(latitude, longitude, radiusMeters, 180),
    getDestinationCoordinate(latitude, longitude, radiusMeters, 225),
    getDestinationCoordinate(latitude, longitude, radiusMeters, 270),
    getDestinationCoordinate(latitude, longitude, radiusMeters, 315),
  ];
}

type GeofenceCameraFitRequest = {
  animated?: boolean;
  center: LatLng;
  childId: string;
  editorHeight: number;
  radiusMeters: number;
};

type ChromeAwareChildRegionArgs = {
  bottomNavHeight: number;
  child: OverviewChildCard;
  chromeVisible: boolean;
  isFullscreen: boolean;
  secondaryTopChromeHeight: number;
  summaryBottomOffset: number;
  summaryHeight: number;
  telemetryHeight: number;
  topBarHeight: number;
  windowHeight: number;
  zoom: "default" | "focused";
};

function getChromeAwareChildRegion({
  bottomNavHeight,
  child,
  chromeVisible,
  isFullscreen,
  secondaryTopChromeHeight,
  summaryBottomOffset,
  summaryHeight,
  telemetryHeight,
  topBarHeight,
  windowHeight,
  zoom,
}: ChromeAwareChildRegionArgs): Region {
  const baseRegion = getChildRegion(child, zoom);

  if (!chromeVisible || isFullscreen || windowHeight <= 0) {
    return baseRegion;
  }

  const topOcclusion =
    topBarHeight + secondaryTopChromeHeight + telemetryHeight + 8;
  const bottomOcclusion = Math.max(
    summaryBottomOffset + summaryHeight,
    bottomNavHeight,
  );
  const visibleTop = topOcclusion;
  const visibleBottom = windowHeight - bottomOcclusion;
  const visibleCenterY = (visibleTop + visibleBottom) / 2;
  const screenCenterY = windowHeight / 2;
  const verticalOffsetPx = visibleCenterY - screenCenterY;
  const latitudeOffset =
    (verticalOffsetPx / windowHeight) * baseRegion.latitudeDelta;

  return {
    ...baseRegion,
    latitude: baseRegion.latitude + latitudeOffset,
  };
}

export default function HomeScreen() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  const router = useRouter();
  const params = useLocalSearchParams<{ childId?: string }>();
  const { rt } = useUnistyles();
  const { isTransitioning, runThemeTransition, transitionTargetTheme } =
    useThemeTransition();
  const { setHidden: setTabBarHidden } = useNativeTabVisibility();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const tabChrome = useTabChrome();
  const selectChromeChild = tabChrome.selectChild;
  const mapRef = useRef<MapViewType | null>(null);
  const firstLocationBlurTargetRef = useRef<View | null>(null);
  const isMapReadyRef = useRef(false);
  const hasAppliedInitialFocusRef = useRef(false);
  const lastSelectedChildIdRef = useRef<string | null>(null);
  const observedLocationFixByChildIdRef = useRef<Record<string, boolean>>({});
  const pendingFirstFixFocusChildIdRef = useRef<string | null>(null);
  const mapActiveTouchCountRef = useRef(0);
  const mapMultiTouchGestureRef = useRef(false);
  const mapInteractionActiveRef = useRef(false);
  const followChildLocationRef = useRef(true);
  const lastFollowedCoordinateRef = useRef<string | null>(null);
  const lastMapInteractionAtRef = useRef(0);
  const mapInteractionRestoreTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const mapFullscreenTransitionTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const mapFullscreenEntryAnimationFrameRef = useRef<number | null>(null);
  const geofenceFitAnimationFrameRef = useRef<number | null>(null);
  const geofenceFitRequestRef = useRef<GeofenceCameraFitRequest | null>(null);
  const geofenceFitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const geofenceFitLastAppliedAtRef = useRef(0);
  const geofenceEditPreviousFollowModeRef = useRef<boolean | null>(null);
  const geofenceEditChildIdRef = useRef<string | null>(null);
  const previousGeofenceStatusRef = useRef<GeofenceUiStatus | null>(null);
  const trailRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const trailRequestInFlightRef = useRef<Set<string>>(new Set());
  const trailLastAttemptAtRef = useRef<Record<string, number>>({});
  const trailRetryAttemptRef = useRef<Record<string, number>>({});
  const trailScheduledAtRef = useRef<number | null>(null);
  const lastTrailCoordinateKeyRef = useRef<string | null>(null);
  const liveTrailSamplesByChildIdRef = useRef<
    Record<string, LiveTrailSample[]>
  >({});
  const homeFocusStartedAtRef = useRef<number | null>(null);
  const homeMapResumeReadyRef = useRef(true);
  const homeMapResumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const latestBlurredOverviewSnapshotRef = useRef<OverviewResponseDto | null>(
    null,
  );
  const latestBlurredChildUpdateRef = useRef<
    Record<string, ChildLiveResponseDto["child"]>
  >({});
  const latestSelectedChildIdRef = useRef<string | null>(null);
  const latestSelectedGeofenceStatusRef = useRef<GeofenceUiStatus>("unset");
  const isHomeFocusedRef = useRef(true);
  const [telemetryNowMs, setTelemetryNowMs] = useState(() => Date.now());
  const [isHomeFocused, setIsHomeFocused] = useState(true);
  const [homeMapResumeReadyVersion, setHomeMapResumeReadyVersion] =
    useState(0);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [mapFullscreenPhase, setMapFullscreenPhase] = useState<
    "idle" | "entering" | "exiting"
  >("idle");
  const [isMapInteracting, setIsMapInteracting] = useState(false);
  const [isFollowingChild, setIsFollowingChild] = useState(true);
  const [overviewErrorMessage, setOverviewErrorMessage] = useState<
    string | null
  >(null);
  const [overviewSnapshotOverride, setOverviewSnapshotOverride] =
    useState<OverviewResponseDto | null>(null);
  const [initialMapRegion] = useState<Region>(defaultRegion);
  const [topBarHeight, setTopBarHeight] = useState(DEFAULT_TOP_BAR_HEIGHT);
  const [secondaryTopChromeHeight, setSecondaryTopChromeHeight] = useState(
    DEFAULT_SECONDARY_TOP_CHROME_HEIGHT,
  );
  const [telemetryHeight, setTelemetryHeight] = useState(
    DEFAULT_TELEMETRY_HEIGHT,
  );
  const [summaryHeight, setSummaryHeight] = useState(DEFAULT_SUMMARY_HEIGHT);
  const [geofenceUiState, dispatchGeofenceUiState] = React.useReducer(
    geofenceUiReducer,
    initialGeofenceUiState,
  );
  const [geofenceDraftsByChildId, setGeofenceDraftsByChildId] = useState<
    Record<string, ChildGeofenceState>
  >({});
  const [geofenceError, setGeofenceError] = useState<string | null>(null);
  const [savingGeofenceForChildId, setSavingGeofenceForChildId] = useState<
    string | null
  >(null);
  const [resetUnavailableAtByChildId, setResetUnavailableAtByChildId] =
    useState<Record<string, string>>({});
  const [isShareSheetVisible, setIsShareSheetVisible] = useState(false);
  const [shareSheetMode, setShareSheetMode] = useState<ShareSheetMode>('create');
  const [isCreatingShareLink, setIsCreatingShareLink] = useState(false);
  const [isStoppingShareLink, setIsStoppingShareLink] = useState(false);
  const [firstLocationGateVisible, setFirstLocationGateVisible] =
    useState(false);
  const [shareErrorMessage, setShareErrorMessage] = useState<string | null>(
    null,
  );
  const pendingNativeShareRef = useRef<{
    childName: string;
    expiryMessage: string;
    url: string;
  } | null>(null);
  const [trailByChildId, setTrailByChildId] = useState<
    Record<string, ChildTrailResponseDto | undefined>
  >({});
  const geofenceUiStateRef = useRef(geofenceUiState);
  const organizationId = auth.user?.family.organization?.id ?? null;
  const realtimeConnectionRevision = useMobileRealtimeConnectionRevision();
  const previousRealtimeConnectionRevisionRef = useRef(
    realtimeConnectionRevision,
  );
  const overviewQuery = useOverviewQuery(organizationId);
  const overviewSnapshot =
    overviewSnapshotOverride ?? overviewQuery.data ?? null;
  const overviewChildren = useMemo(
    () => overviewSnapshot?.children ?? [],
    [overviewSnapshot],
  );
  const rawOverviewChildrenById = useMemo(
    () =>
      Object.fromEntries(
        overviewChildren.map((child) => [child.id, child]),
      ) as Record<string, OverviewChildDto>,
    [overviewChildren],
  );
  const displayOverviewChildren = useMemo(
    () =>
      overviewChildren.map((child) => {
        const displayGeofence = getTransactionDisplayGeofence(
          geofenceUiState.transactionsByChildId[child.id],
        );

        return displayGeofence
          ? { ...child, geofence: displayGeofence }
          : child;
      }),
    [geofenceUiState.transactionsByChildId, overviewChildren],
  );
  const overviewSelectedChildId = overviewSnapshot?.selectedChildId ?? null;
  const errorMessage =
    overviewErrorMessage ??
    (overviewQuery.error instanceof Error
      ? overviewQuery.error.message
      : overviewQuery.error
        ? "Failed to load the family overview."
        : null);

  const children = useMemo(
    () =>
      displayOverviewChildren.map((child) =>
        toOverviewChildCard(child, telemetryNowMs),
      ),
    [displayOverviewChildren, telemetryNowMs],
  );
  const canManageChildren = Boolean(
    auth.user?.family.permissions.canManageChildren,
  );
  const canManageGeofences = Boolean(
    auth.user?.family.permissions.canManageGeofences,
  );
  const canCreateShareLinks = Boolean(
    auth.user?.family.permissions.canCreateShareLinks,
  );
  const canUseLiveSharing =
    HOME_LIVE_SHARING_ENABLED && canCreateShareLinks;
  const isLoading =
    !tabChrome.isSelectionLoaded || (overviewQuery.isPending && !overviewSnapshot);
  const effectiveSelectedChildId =
    tabChrome.selectedChildId
      && children.some((child) => child.id === tabChrome.selectedChildId)
      ? tabChrome.selectedChildId
      : overviewSelectedChildId &&
            children.some((child) => child.id === overviewSelectedChildId)
          ? overviewSelectedChildId
          : (displayOverviewChildren[0]?.id ?? null);
  const selectedChild = useMemo(
    () =>
      children.find((child) => child.id === effectiveSelectedChildId) ??
      children[0] ??
      null,
    [children, effectiveSelectedChildId],
  );
  const activeShareQuery = useActiveChildShareQuery(
    selectedChild?.id ?? null,
    canUseLiveSharing && isHomeFocused,
  );
  const activeShare = activeShareQuery.data?.share ?? null;
  const selectedRawChild = selectedChild
    ? (rawOverviewChildrenById[selectedChild.id] ?? null)
    : null;
  const isWaitingForFirstLocation = Boolean(
    selectedChild && !selectedChild.hasLocationFix,
  );
  const isFirstLocationGateBlocking =
    isWaitingForFirstLocation || firstLocationGateVisible;
  const geofencesByChildId = useMemo(() => {
    const next = Object.fromEntries(
      displayOverviewChildren.map((child) => [
        child.id,
        toGeofenceState(child.geofence),
      ]),
    ) as Record<string, ChildGeofenceState>;

    for (const [childId, draft] of Object.entries(geofenceDraftsByChildId)) {
      next[childId] = draft;
    }

    return next;
  }, [displayOverviewChildren, geofenceDraftsByChildId]);
  const selectedGeofence = selectedChild
    ? (geofencesByChildId[selectedChild.id] ?? createDefaultGeofenceState())
    : createDefaultGeofenceState();
  const selectedGeofenceResetLocationFresh = Boolean(
    selectedChild
      && isGeofenceResetLocationFresh(selectedChild.lastSeenAt, telemetryNowMs)
      && resetUnavailableAtByChildId[selectedChild.id]
        !== selectedChild.lastSeenAt,
  );
  const selectedBreachAction = selectedGeofenceResetLocationFresh
    ? "reset" as const
    : "disable" as const;
  const selectedChildTrail = selectedChild
    ? (trailByChildId[selectedChild.id] ?? null)
    : null;
  // Module-level EMPTY fallback: a fresh `[]` literal here gave PastelMap and
  // MovementTrail a new prop identity on every render, defeating both memos.
  const selectedChildLiveTrailSamples = selectedChild
    ? (liveTrailSamplesByChildIdRef.current[selectedChild.id] ?? EMPTY_LIVE_TRAIL_SAMPLES)
    : EMPTY_LIVE_TRAIL_SAMPLES;
  // Keeps the radius drag off the React render path entirely; only the committed
  // value on release reaches state.
  const geofenceRadiusDrag = useGeofenceRadiusDrag({
    active: selectedGeofence.status === "editing" && isHomeFocused,
    onCommit: handleGeofenceRadiusCommit,
    radiusMeters: selectedGeofence.radiusMeters,
    unit: selectedGeofence.radiusUnit,
  });
  const isGeofenceRadiusDragging = geofenceRadiusDrag.isDragging;
  const selectedChildTrailKey = selectedChild
    ? selectedChild.hasLocationFix
      ? `${selectedChild.id}:${selectedChild.latitude}:${selectedChild.longitude}`
      : null
    : null;
  const selectedChildGeofenceStatus = selectedGeofence.status;
  const selectedChildIdForGeofence = selectedChild?.id ?? null;

  function commitGeofenceUiAction(action: GeofenceUiAction) {
    geofenceUiStateRef.current = geofenceUiReducer(
      geofenceUiStateRef.current,
      action,
    );
    dispatchGeofenceUiState(action);
  }

  useEffect(() => {
    geofenceUiStateRef.current = geofenceUiState;
  }, [geofenceUiState]);

  useEffect(() => {
    latestSelectedChildIdRef.current =
      tabChrome.selectedChildId ?? effectiveSelectedChildId ?? null;
    latestSelectedGeofenceStatusRef.current = selectedGeofence.status;
  }, [effectiveSelectedChildId, selectedGeofence.status, tabChrome.selectedChildId]);

  const themeName = rt.themeName === "dark" ? "dark" : "light";
  const statusBarThemeName = isTransitioning
    ? (transitionTargetTheme ?? themeName)
    : themeName;
  const isMapFullscreenAnimating = mapFullscreenPhase !== "idle";
  const isNormalMapInteraction = isMapInteracting && !isMapFullscreen;
  const showPersistentTopBar = true;
  const showSecondaryTopChrome =
    !isMapFullscreen || mapFullscreenPhase === "exiting";
  const showHomeBottomChrome =
    !isMapFullscreen || mapFullscreenPhase === "exiting";
  const bottomNavigationHeight =
    Platform.OS === "ios" ? IOS_NATIVE_TAB_BAR_HEIGHT + insets.bottom : 0;
  const summaryBottomOffset = showHomeBottomChrome
    ? bottomNavigationHeight + HOME_BOTTOM_CHROME_GAP
    : Math.max(insets.bottom, HOME_BOTTOM_CHROME_GAP);
  const floatingBottomOffset =
    summaryBottomOffset + Math.max(summaryHeight + 20, 104);
  const controlsHidden = isNormalMapInteraction || isMapFullscreenAnimating;
  const secondaryTopChromeHidden =
    isNormalMapInteraction || isMapFullscreenAnimating;
  const shouldHideNativeTabBar =
    secondaryTopChromeHidden || !showHomeBottomChrome;
  const chromeVisibleForCamera = !controlsHidden && !isMapFullscreen;
  const mapControlsTopOffset =
    isMapFullscreen || isNormalMapInteraction
      ? topBarHeight + 16
      : topBarHeight + secondaryTopChromeHeight + telemetryHeight + 28;
  const visibleGeofenceRadius =
    selectedGeofence.status === "editing"
      ? selectedGeofence.radiusMeters
      : selectedGeofence.savedRadiusMeters;
  const visibleGeofenceCenter = useMemo(() => {
    if (!selectedChild) {
      return defaultRegion;
    }

    if (
      selectedGeofence.status === "editing" &&
      (selectedGeofence.editOriginStatus === "unset" ||
        selectedGeofence.editOriginStatus === "disabled")
    ) {
      return getSelectedChildCenter(selectedChild);
    }

    if (
      selectedGeofence.centerLatitude != null &&
      selectedGeofence.centerLongitude != null
    ) {
      return {
        latitude: selectedGeofence.centerLatitude,
        longitude: selectedGeofence.centerLongitude,
      };
    }

    return getSelectedChildCenter(selectedChild);
  }, [
    selectedChild,
    selectedGeofence.centerLatitude,
    selectedGeofence.centerLongitude,
    selectedGeofence.editOriginStatus,
    selectedGeofence.status,
  ]);

  // React state remains committed-only. The native map reads the drag's shared
  // value for its Skia preview while the camera stays fixed until finger-up.
  const mapGeofenceRadius = visibleGeofenceRadius;
  const topBarSecondaryAction =
    isMapFullscreen || mapFullscreenPhase === "entering"
      ? { kind: "collapse" as const, onPress: handleCollapseMap }
      : undefined;

  function handleAddChildPress() {
    if (!canManageChildren) {
      return;
    }

    router.push("/add-child/connect-device?returnTo=home" as never);
  }

  async function handleOpenShareSheet() {
    if (
      !HOME_LIVE_SHARING_ENABLED ||
      !selectedChild ||
      isWaitingForFirstLocation ||
      !canCreateShareLinks ||
      isCreatingShareLink ||
      isStoppingShareLink
    ) {
      return;
    }

    setShareErrorMessage(null);
    let currentShare = activeShare;

    if (activeShareQuery.isError) {
      const refreshed = await activeShareQuery.refetch();
      if (refreshed.error) {
        Alert.alert(
          "Unable to check sharing",
          "We couldn't confirm whether a live link is already active. Try again.",
        );
        return;
      }
      currentShare = refreshed.data?.share ?? null;
    }

    const isCurrent = Boolean(
      currentShare && new Date(currentShare.expiresAt).getTime() > Date.now(),
    );
    setShareSheetMode(isCurrent ? 'manage' : 'create');
    setIsShareSheetVisible(true);
  }

  const secondaryTopChromeStyle = useAnimatedStyle(
    () => ({
      opacity: withTiming(secondaryTopChromeHidden ? 0 : 1, {
        duration: secondaryTopChromeHidden
          ? CHROME_HIDE_DURATION
          : CHROME_SHOW_DURATION,
      }),
      transform: [
        {
          translateY: withTiming(
            secondaryTopChromeHidden ? -(secondaryTopChromeHeight + 24) : 0,
            {
              duration: secondaryTopChromeHidden
                ? CHROME_HIDE_DURATION
                : CHROME_SHOW_DURATION,
            },
          ),
        },
      ],
    }),
    [secondaryTopChromeHidden, secondaryTopChromeHeight],
  );

  const telemetryStyle = useAnimatedStyle(
    () => ({
      opacity: withTiming(secondaryTopChromeHidden ? 0 : 1, {
        duration: secondaryTopChromeHidden
          ? CHROME_HIDE_DURATION
          : CHROME_SHOW_DURATION,
      }),
      transform: [
        {
          translateY: withTiming(
            secondaryTopChromeHidden
              ? -(secondaryTopChromeHeight + telemetryHeight + 48)
              : 0,
            {
              duration: secondaryTopChromeHidden
                ? CHROME_HIDE_DURATION
                : CHROME_SHOW_DURATION,
            },
          ),
        },
      ],
    }),
    [secondaryTopChromeHidden, secondaryTopChromeHeight, telemetryHeight],
  );

  const clearGeofenceFitAnimationFrame = React.useCallback(() => {
    if (geofenceFitAnimationFrameRef.current != null) {
      cancelAnimationFrame(geofenceFitAnimationFrameRef.current);
      geofenceFitAnimationFrameRef.current = null;
    }
  }, []);

  const clearGeofenceFitTimeout = React.useCallback(() => {
    if (geofenceFitTimeoutRef.current) {
      clearTimeout(geofenceFitTimeoutRef.current);
      geofenceFitTimeoutRef.current = null;
    }
  }, []);

  const cancelGeofenceCameraFit = React.useCallback(() => {
    clearGeofenceFitTimeout();
    clearGeofenceFitAnimationFrame();
    geofenceFitRequestRef.current = null;
  }, [clearGeofenceFitAnimationFrame, clearGeofenceFitTimeout]);

  const applyGeofenceCameraFit = React.useCallback(
    (request: GeofenceCameraFitRequest) => {
      if (
        Platform.OS === "web" ||
        !isHomeFocusedRef.current ||
        !homeMapResumeReadyRef.current ||
        !isMapReadyRef.current ||
        !mapRef.current ||
        geofenceEditChildIdRef.current !== request.childId
      ) {
        return false;
      }

      clearGeofenceFitAnimationFrame();

      const framingRadiusMeters = Math.max(
        request.radiusMeters,
        MIN_GEOFENCE_FRAMING_RADIUS_METERS,
      );
      const boundaryCoordinates = getGeofenceBoundaryCoordinates(
        request.center.latitude,
        request.center.longitude,
        framingRadiusMeters,
      );

      geofenceFitAnimationFrameRef.current = requestAnimationFrame(() => {
        mapRef.current?.fitToCoordinates(boundaryCoordinates, {
          // Animated by default so the tile load after a drag reads as a camera
          // move rather than a freeze. Fits are never scheduled mid-drag.
          animated: request.animated ?? true,
          edgePadding: {
            top:
              topBarHeight +
              secondaryTopChromeHeight +
              telemetryHeight +
              GEOFENCE_EDGE_PADDING_VERTICAL,
            right: GEOFENCE_EDGE_PADDING_HORIZONTAL,
            bottom:
              summaryBottomOffset +
              request.editorHeight +
              GEOFENCE_EDGE_PADDING_VERTICAL,
            left: GEOFENCE_EDGE_PADDING_HORIZONTAL,
          },
        });
        geofenceFitAnimationFrameRef.current = null;
        geofenceFitLastAppliedAtRef.current = Date.now();
      });

      return true;
    },
    [
      clearGeofenceFitAnimationFrame,
      secondaryTopChromeHeight,
      summaryBottomOffset,
      telemetryHeight,
      topBarHeight,
    ],
  );

  const flushGeofenceCameraFit = React.useCallback(() => {
    const request = geofenceFitRequestRef.current;
    clearGeofenceFitTimeout();

    if (!request || geofenceEditChildIdRef.current !== request.childId) {
      return;
    }

    applyGeofenceCameraFit(request);
  }, [applyGeofenceCameraFit, clearGeofenceFitTimeout]);

  const scheduleGeofenceCameraFit = React.useCallback(
    (request: GeofenceCameraFitRequest, options?: { immediate?: boolean }) => {
      geofenceFitRequestRef.current = {
        ...request,
        animated: options?.immediate === true,
      };

      if (
        Platform.OS === "web" ||
        !isHomeFocusedRef.current ||
        !homeMapResumeReadyRef.current ||
        geofenceEditChildIdRef.current !== request.childId
      ) {
        return;
      }

      if (options?.immediate) {
        flushGeofenceCameraFit();
        return;
      }

      const elapsed = Date.now() - geofenceFitLastAppliedAtRef.current;

      if (elapsed >= GEOFENCE_FIT_THROTTLE_MS) {
        flushGeofenceCameraFit();
        return;
      }

      clearGeofenceFitTimeout();
      geofenceFitTimeoutRef.current = setTimeout(() => {
        geofenceFitTimeoutRef.current = null;
        flushGeofenceCameraFit();
      }, GEOFENCE_FIT_THROTTLE_MS - elapsed);
    },
    [clearGeofenceFitTimeout, flushGeofenceCameraFit],
  );

  useEffect(() => {
    setTabBarHidden(shouldHideNativeTabBar);

    return () => {
      setTabBarHidden(false);
    };
  }, [setTabBarHidden, shouldHideNativeTabBar]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTelemetryNowMs(Date.now());
    }, 30_000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const handleTransientBackAction = React.useCallback(() => {
    if (
      selectedChildIdForGeofence &&
      selectedChildGeofenceStatus === "editing"
    ) {
      setGeofenceDraftsByChildId((current) => {
        if (!(selectedChildIdForGeofence in current)) {
          return current;
        }

        const next = { ...current };
        delete next[selectedChildIdForGeofence];
        return next;
      });
      setGeofenceError(null);
      return true;
    }

    if (isMapFullscreen || mapFullscreenPhase !== "idle") {
      if (mapInteractionRestoreTimeoutRef.current) {
        clearTimeout(mapInteractionRestoreTimeoutRef.current);
        mapInteractionRestoreTimeoutRef.current = null;
      }
      if (mapFullscreenTransitionTimeoutRef.current) {
        clearTimeout(mapFullscreenTransitionTimeoutRef.current);
        mapFullscreenTransitionTimeoutRef.current = null;
      }
      if (mapFullscreenEntryAnimationFrameRef.current != null) {
        cancelAnimationFrame(mapFullscreenEntryAnimationFrameRef.current);
        mapFullscreenEntryAnimationFrameRef.current = null;
      }

      setIsMapFullscreen(false);
      setMapFullscreenPhase("exiting");
      mapFullscreenEntryAnimationFrameRef.current = requestAnimationFrame(
        () => {
          setMapFullscreenPhase("idle");
          mapFullscreenEntryAnimationFrameRef.current = null;
        },
      );
      return true;
    }

    return false;
  }, [
    isMapFullscreen,
    mapFullscreenPhase,
    selectedChildGeofenceStatus,
    selectedChildIdForGeofence,
  ]);

  function recordLiveTrailSample(input: {
    childId: string;
    latitude: number | null;
    longitude: number | null;
    occurredAt: string | null;
  }) {
    if (
      input.latitude == null ||
      input.longitude == null ||
      !input.occurredAt
    ) {
      return;
    }

    if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
      return;
    }

    const occurredAtMs = new Date(input.occurredAt).getTime();

    if (!Number.isFinite(occurredAtMs)) {
      return;
    }

    const nextSample = {
      latitude: input.latitude,
      longitude: input.longitude,
      occurredAt: input.occurredAt,
    } satisfies LiveTrailSample;
    const cutoffMs = Date.now() - LIVE_TRAIL_SAMPLE_MAX_AGE_MS;
    const existingSamples =
      liveTrailSamplesByChildIdRef.current[input.childId] ?? [];
    const retainedSamples = existingSamples.filter((sample) => {
      const sampleOccurredAtMs = new Date(sample.occurredAt).getTime();
      return (
        Number.isFinite(sampleOccurredAtMs) && sampleOccurredAtMs >= cutoffMs
      );
    });
    const lastSample = retainedSamples[retainedSamples.length - 1];

    if (
      lastSample &&
      lastSample.occurredAt === nextSample.occurredAt &&
      lastSample.latitude === nextSample.latitude &&
      lastSample.longitude === nextSample.longitude
    ) {
      return;
    }

    liveTrailSamplesByChildIdRef.current[input.childId] = [
      ...retainedSamples,
      nextSample,
    ].slice(-LIVE_TRAIL_SAMPLE_LIMIT);
  }

  function pruneConfirmedLiveTrailSamples(
    childId: string,
    trail: ChildTrailResponseDto,
  ) {
    const latestConfirmedOccurredAt =
      trail.points[trail.points.length - 1]?.occurredAt;

    if (!latestConfirmedOccurredAt) {
      return;
    }

    const latestConfirmedOccurredAtMs = new Date(
      latestConfirmedOccurredAt,
    ).getTime();

    if (!Number.isFinite(latestConfirmedOccurredAtMs)) {
      return;
    }

    const existingSamples = liveTrailSamplesByChildIdRef.current[childId];

    if (!existingSamples?.length) {
      return;
    }

    liveTrailSamplesByChildIdRef.current[childId] = existingSamples.filter(
      (sample) => {
        const sampleOccurredAtMs = new Date(sample.occurredAt).getTime();
        return (
          !Number.isFinite(sampleOccurredAtMs) ||
          sampleOccurredAtMs > latestConfirmedOccurredAtMs
        );
      },
    );
  }

  const clearGeofenceDraft = React.useCallback((childId: string) => {
    setGeofenceDraftsByChildId((current) => {
      if (!(childId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[childId];
      return next;
    });
  }, []);

  const clearTrailRefreshTimer = React.useCallback(() => {
    if (trailRefreshTimeoutRef.current) {
      clearTimeout(trailRefreshTimeoutRef.current);
      trailRefreshTimeoutRef.current = null;
    }
    trailScheduledAtRef.current = null;
  }, []);

  function hasMatchingGeofenceTransaction(childId: string, mutationId: string) {
    const transaction =
      geofenceUiStateRef.current.transactionsByChildId[childId];
    return transaction?.mutationId === mutationId;
  }

  const isIncomingGeofenceStale = React.useCallback(
    (
      childId: string,
      incomingGeofence: ChildGeofenceDto,
      source: "local" | "overview.snapshot",
    ) => {
      const guard = geofenceUiStateRef.current.staleGuardsByChildId[childId];

      if (!guard) {
        return false;
      }

      const minimumUpdatedAtMs = Date.parse(guard.minimumUpdatedAt);

      if (!Number.isFinite(minimumUpdatedAtMs)) {
        return false;
      }

      const incomingUpdatedAtMs = incomingGeofence.updatedAt
        ? Date.parse(incomingGeofence.updatedAt)
        : Number.NaN;
      const isStale =
        !Number.isFinite(incomingUpdatedAtMs) ||
        incomingUpdatedAtMs < minimumUpdatedAtMs;

      if (__DEV__ && isStale) {
        console.info("[geofence] stale incoming geofence ignored", {
          childId,
          incomingUpdatedAt: incomingGeofence.updatedAt,
          minimumUpdatedAt: guard.minimumUpdatedAt,
          source,
        });
      }

      return isStale;
    },
    [],
  );

  const mergeChildGeofenceWithGuard = React.useCallback(
    (
      childId: string,
      currentGeofence: ChildGeofenceDto,
      incomingGeofence: ChildGeofenceDto,
      source: "local" | "overview.snapshot",
    ) => {
      return isIncomingGeofenceStale(childId, incomingGeofence, source)
        ? currentGeofence
        : incomingGeofence;
    },
    [isIncomingGeofenceStale],
  );

  function beginGeofenceTransaction(input: {
    action: GeofenceTransactionAction;
    childId: string;
    optimisticGeofence: ChildGeofenceDto;
    previousDraft: ChildGeofenceState | null;
    previousGeofence: ChildGeofenceDto;
  }) {
    const startedAt = Date.now();
    const mutationId = `${input.action}:${input.childId}:${startedAt}`;

    commitGeofenceUiAction({
      type: "begin",
      transaction: {
        action: input.action,
        childId: input.childId,
        mutationId,
        phase: "pending",
        optimisticGeofence: input.optimisticGeofence,
        previousDraft: input.previousDraft,
        previousGeofence: input.previousGeofence,
        serverGeofence: null,
        startedAt,
      },
    });
    setSavingGeofenceForChildId(input.childId);
    setGeofenceError(null);
    clearGeofenceDraft(input.childId);

    if (__DEV__) {
      console.info("[geofence] optimistic applied", {
        action: input.action,
        childId: input.childId,
        mutationId,
        elapsedMs: Date.now() - startedAt,
      });
    }

    return { mutationId, startedAt };
  }

  const writeRawOverviewSnapshot = React.useCallback(
    (
      response: OverviewResponseDto,
      source: "local" | "overview.snapshot" = "local",
    ) => {
      const queryKey = organizationId
        ? queryKeys.overview(organizationId)
        : null;
      const cachedOverview = queryKey
        ? queryClient.getQueryData<OverviewResponseDto>(queryKey)
        : undefined;

      const mergeSnapshot = (current: OverviewResponseDto | undefined) => {
        const currentChildrenById = new Map(
          current?.children.map((child) => [child.id, child]),
        );

        return {
          ...response,
          children: response.children.map((child) => {
            const currentChild = currentChildrenById.get(child.id);

            if (!currentChild) {
              return child;
            }

            const nextGeofence = mergeChildGeofenceWithGuard(
              child.id,
              currentChild.geofence,
              child.geofence,
              source,
            );

            if (isOlderChildTelemetry(currentChild, child)) {
              return nextGeofence === currentChild.geofence
                ? currentChild
                : { ...currentChild, geofence: nextGeofence };
            }

            return nextGeofence === child.geofence
              ? child
              : { ...child, geofence: nextGeofence };
          }),
        };
      };

      const next = mergeSnapshot(cachedOverview);
      for (const child of response.children) {
        const currentChild = cachedOverview?.children.find(
          (candidate) => candidate.id === child.id,
        );

        if (!currentChild || !isOlderChildTelemetry(currentChild, child)) {
          recordLiveTrailSample({
            childId: child.id,
            latitude: child.latitude,
            longitude: child.longitude,
            occurredAt: child.lastSeenAt,
          });
        }
      }

      setOverviewSnapshotOverride((current) =>
        mergeSnapshot(current ?? cachedOverview),
      );
      setOverviewErrorMessage(null);

      if (queryKey) {
        queryClient.setQueryData(queryKey, next);
      }
    },
    [mergeChildGeofenceWithGuard, organizationId, queryClient],
  );

  const mergeRawOverviewChildUpdate = React.useCallback(
    (childUpdate: ChildLiveResponseDto["child"]) => {
      const queryKey = organizationId
        ? queryKeys.overview(organizationId)
        : null;
      const cachedOverview = queryKey
        ? queryClient.getQueryData<OverviewResponseDto>(queryKey)
        : undefined;
      const nextCachedOverview = cachedOverview
        ? mergeChildUpdateIntoOverview(cachedOverview, childUpdate)
        : undefined;

      if (cachedOverview && nextCachedOverview === cachedOverview) {
        return;
      }

      recordLiveTrailSample({
        childId: childUpdate.id,
        latitude: childUpdate.latitude,
        longitude: childUpdate.longitude,
        occurredAt: childUpdate.lastSeenAt,
      });

      setOverviewSnapshotOverride((current) => {
        const base = current ?? cachedOverview;
        return base
          ? mergeChildUpdateIntoOverview(base, childUpdate)
          : current;
      });

      if (queryKey && nextCachedOverview) {
        queryClient.setQueryData(queryKey, nextCachedOverview);
      }
    },
    [organizationId, queryClient],
  );

  const writeRawOverviewChildGeofence = React.useCallback(
    (childId: string, geofence: ChildGeofenceDto) => {
      setOverviewSnapshotOverride((current) => {
        const base = current ?? (organizationId
          ? queryClient.getQueryData<OverviewResponseDto>(
            queryKeys.overview(organizationId),
          )
          : undefined);
        if (!base) {
          return current;
        }

        return {
          ...base,
          children: base.children.map((child) =>
            child.id === childId ? { ...child, geofence } : child,
          ),
        };
      });

      if (organizationId) {
        queryClient.setQueryData(
          queryKeys.overview(organizationId),
          (current: OverviewResponseDto | undefined) => {
            if (!current) {
              return current;
            }

            return {
              ...current,
              children: current.children.map((child) =>
                child.id === childId ? { ...child, geofence } : child,
              ),
            };
          },
        );
      }
    },
    [organizationId, queryClient],
  );

  const clearHomeMapResumeTimer = React.useCallback(() => {
    if (homeMapResumeTimeoutRef.current) {
      clearTimeout(homeMapResumeTimeoutRef.current);
      homeMapResumeTimeoutRef.current = null;
    }
  }, []);

  const flushBlurredOverviewUpdates = React.useCallback(() => {
    const bufferedSnapshot = latestBlurredOverviewSnapshotRef.current;
    const bufferedChildUpdates = Object.values(
      latestBlurredChildUpdateRef.current,
    );

    latestBlurredOverviewSnapshotRef.current = null;
    latestBlurredChildUpdateRef.current = {};

    if (bufferedSnapshot) {
      writeRawOverviewSnapshot(bufferedSnapshot, "overview.snapshot");
    }

    for (const childUpdate of bufferedChildUpdates) {
      mergeRawOverviewChildUpdate(childUpdate);
    }
  }, [mergeRawOverviewChildUpdate, writeRawOverviewSnapshot]);

  const reconcileOverview = React.useCallback(async () => {
    if (!organizationId) {
      return;
    }

    const queryKey = queryKeys.overview(organizationId);

    try {
      const response = await queryClient.fetchQuery({
        queryKey,
        queryFn: ({ signal }) =>
          getOverview({ operationName: "getOverview", signal }),
        staleTime: 0,
      });

      if (!isHomeFocusedRef.current) {
        latestBlurredOverviewSnapshotRef.current = response;
        return;
      }

      writeRawOverviewSnapshot(response);
    } catch (error) {
      if (queryClient.getQueryData<OverviewResponseDto>(queryKey)) {
        return;
      }

      setOverviewErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to load the family overview.",
      );
    }
  }, [organizationId, queryClient, writeRawOverviewSnapshot]);

  useMobileRealtimeEvent((event) => {
    if (event.type === "overview.snapshot") {
      if (!isHomeFocusedRef.current) {
        latestBlurredOverviewSnapshotRef.current = event.data;
        return;
      }

      writeRawOverviewSnapshot(event.data, "overview.snapshot");
      return;
    }

    if (event.type !== "child.updated") {
      return;
    }

    if (!isHomeFocusedRef.current) {
      const currentBufferedUpdate =
        latestBlurredChildUpdateRef.current[event.data.child.id];

      if (
        !currentBufferedUpdate
        || !isOlderChildTelemetry(currentBufferedUpdate, event.data.child)
      ) {
        latestBlurredChildUpdateRef.current[event.data.child.id] =
          event.data.child;
      }
      return;
    }

    mergeRawOverviewChildUpdate(event.data.child);
  });

  useFocusEffect(
    React.useCallback(() => {
      isHomeFocusedRef.current = true;
      setIsHomeFocused(true);
      homeMapResumeReadyRef.current = false;
      homeFocusStartedAtRef.current = nowMs();

      if (__DEV__) {
        console.info("[home-perf] focus start", {
          childId: latestSelectedChildIdRef.current,
        });
      }

      flushBlurredOverviewUpdates();
      void reconcileOverview();
      clearHomeMapResumeTimer();
      homeMapResumeTimeoutRef.current = setTimeout(() => {
        homeMapResumeReadyRef.current = true;
        homeMapResumeTimeoutRef.current = null;
        setHomeMapResumeReadyVersion((current) => current + 1);

        if (latestSelectedGeofenceStatusRef.current === "editing") {
          flushGeofenceCameraFit();
        }

        if (__DEV__) {
          const durationMs =
            homeFocusStartedAtRef.current == null
              ? undefined
              : Math.round(nowMs() - homeFocusStartedAtRef.current);

          console.info("[home-perf] map resume", { durationMs });
          console.info("[home-perf] focus settled", { durationMs });
        }
      }, HOME_MAP_RESUME_DELAY_MS);

      if (!organizationId) {
        return () => {
          isHomeFocusedRef.current = false;
          setIsHomeFocused(false);
          homeMapResumeReadyRef.current = false;
          clearHomeMapResumeTimer();
          cancelGeofenceCameraFit();
          clearTrailRefreshTimer();
        };
      }

      void queryClient.invalidateQueries({
        queryKey: queryKeys.unreadNotificationCount(organizationId),
      });
      if (latestSelectedChildIdRef.current && canUseLiveSharing) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.activeChildShare(latestSelectedChildIdRef.current),
        });
      }

      return () => {
        isHomeFocusedRef.current = false;
        setIsHomeFocused(false);
        homeMapResumeReadyRef.current = false;
        clearHomeMapResumeTimer();
        cancelGeofenceCameraFit();
        clearTrailRefreshTimer();
      };
    }, [
      cancelGeofenceCameraFit,
      clearHomeMapResumeTimer,
      clearTrailRefreshTimer,
      canUseLiveSharing,
      flushBlurredOverviewUpdates,
      flushGeofenceCameraFit,
      organizationId,
      queryClient,
      reconcileOverview,
    ]),
  );

  useEffect(() => {
    const childId = params.childId;

    if (!childId || !children.some((child) => child.id === childId)) {
      return;
    }

    const timeout = setTimeout(() => {
      setFollowMode(true);
      lastFollowedCoordinateRef.current = null;
      selectChromeChild(childId);
    }, 0);

    return () => {
      clearTimeout(timeout);
    };
  }, [children, params.childId, selectChromeChild]);

  useEffect(() => {
    if (!organizationId || !isHomeFocused) {
      return;
    }

    const interval = setInterval(() => {
      void reconcileOverview();
    }, HOME_OVERVIEW_RECONCILE_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [isHomeFocused, organizationId, reconcileOverview]);

  useEffect(() => {
    const previousRevision = previousRealtimeConnectionRevisionRef.current;
    previousRealtimeConnectionRevisionRef.current = realtimeConnectionRevision;

    if (
      realtimeConnectionRevision !== previousRevision
      && isHomeFocusedRef.current
    ) {
      void reconcileOverview();
    }
  }, [realtimeConnectionRevision, reconcileOverview]);

  useEffect(() => {
    if (!organizationId) {
      return;
    }

    const timeout = setTimeout(() => {
      void prefetchFamilyMembers(queryClient, organizationId);
    }, 750);

    return () => {
      clearTimeout(timeout);
    };
  }, [organizationId, queryClient]);

  useEffect(() => {
    if (
      selectedGeofence.status !== "editing" &&
      !isMapFullscreen &&
      mapFullscreenPhase === "idle"
    ) {
      return;
    }

    return navigation.addListener("beforeRemove", (event) => {
      if (!handleTransientBackAction()) {
        return;
      }

      event.preventDefault();
    });
  }, [
    handleTransientBackAction,
    isMapFullscreen,
    mapFullscreenPhase,
    navigation,
    selectedGeofence.status,
  ]);

  useEffect(() => {
    if (
      selectedGeofence.status !== "editing" &&
      !isMapFullscreen &&
      mapFullscreenPhase === "idle"
    ) {
      return;
    }

    const subscription = BackHandler.addEventListener("hardwareBackPress", () =>
      handleTransientBackAction(),
    );

    return () => {
      subscription.remove();
    };
  }, [
    handleTransientBackAction,
    isMapFullscreen,
    mapFullscreenPhase,
    selectedGeofence.status,
  ]);

  useEffect(
    () => () => {
      clearHomeMapResumeTimer();
      clearMapRestoreTimer();
      clearMapFullscreenTransitionTimer();
      clearMapFullscreenEntryAnimationFrame();
      cancelGeofenceCameraFit();
      if (trailRefreshTimeoutRef.current) {
        clearTimeout(trailRefreshTimeoutRef.current);
      }
    },
    [cancelGeofenceCameraFit, clearHomeMapResumeTimer],
  );

  const refreshChildTrail = React.useCallback(
    async (
      childId: string,
      reason: "initial" | "throttled" | "retry" = "initial",
    ) => {
      if (trailRequestInFlightRef.current.has(childId)) {
        return;
      }

      trailRequestInFlightRef.current.add(childId);
      trailLastAttemptAtRef.current[childId] = Date.now();

      try {
        const geometry = Platform.OS === "web" ? "filtered" : "roads";
        const response = await queryClient.fetchQuery({
          queryKey: queryKeys.childTrail(
            childId,
            TRAIL_DISTANCE_METERS,
            geometry,
          ),
          queryFn: ({ signal }) =>
            getChildTrail(
              childId,
              {
                distanceMeters: TRAIL_DISTANCE_METERS,
                geometry,
              },
              {
                operationName: "getChildTrail",
                signal,
              },
            ),
        });

        trailRetryAttemptRef.current[childId] = 0;

        if (__DEV__) {
          console.info("[trail] loaded", {
            childId,
            distanceMeters: response.distanceMeters,
            pointCount: response.points.length,
          });
        }

        if (__DEV__ && response.points.length < 2) {
          console.info("[trail] insufficient points", {
            childId,
            pointCount: response.points.length,
          });
        }

        pruneConfirmedLiveTrailSamples(childId, response);
        setTrailByChildId((current) => ({
          ...current,
          [childId]: response,
        }));
      } catch (error) {
        const retryAttempt = trailRetryAttemptRef.current[childId] ?? 0;

        if (__DEV__) {
          console.warn("[trail] refresh failed", {
            childId,
            code: error instanceof ApiError ? error.code : undefined,
            reason,
            retryAttempt,
            status: error instanceof ApiError ? error.status : undefined,
          });
        }

        if (
          effectiveSelectedChildId === childId &&
          shouldRetryTrailRefresh(error)
        ) {
          const retryDelayMs = getNextTrailRetryDelayMs(retryAttempt);
          trailRetryAttemptRef.current[childId] = retryAttempt + 1;

          clearTrailRefreshTimer();
          trailScheduledAtRef.current = Date.now() + retryDelayMs;
          trailRefreshTimeoutRef.current = setTimeout(() => {
            trailRefreshTimeoutRef.current = null;
            trailScheduledAtRef.current = null;
            void refreshChildTrail(childId, "retry");
          }, retryDelayMs);
        }
      } finally {
        trailRequestInFlightRef.current.delete(childId);
      }
    },
    [clearTrailRefreshTimer, effectiveSelectedChildId, queryClient],
  );

  useEffect(() => {
    clearTrailRefreshTimer();

    if (!isHomeFocused || !selectedChild || !selectedChildTrailKey) {
      lastTrailCoordinateKeyRef.current = null;
      return;
    }

    if (lastTrailCoordinateKeyRef.current === selectedChildTrailKey) {
      return;
    }

    const selectedChildChanged = !lastTrailCoordinateKeyRef.current?.startsWith(
      `${selectedChild.id}:`,
    );
    const hasExistingTrail = Boolean(
      trailByChildId[selectedChild.id]?.points.length,
    );

    lastTrailCoordinateKeyRef.current = selectedChildTrailKey;

    if (selectedChildChanged) {
      trailRetryAttemptRef.current[selectedChild.id] = 0;
      void refreshChildTrail(selectedChild.id, "initial");
      return;
    }

    if (!hasExistingTrail) {
      void refreshChildTrail(selectedChild.id, "initial");
      return;
    }

    const delayMs = shouldScheduleTrailRefresh(
      trailLastAttemptAtRef.current[selectedChild.id],
      Date.now(),
      TRAIL_REFRESH_THROTTLE_MS,
    );

    if (delayMs === 0) {
      void refreshChildTrail(selectedChild.id, "throttled");
      return;
    }

    const scheduledAt = Date.now() + delayMs;

    if (
      trailScheduledAtRef.current != null &&
      trailScheduledAtRef.current <= scheduledAt
    ) {
      return;
    }

    clearTrailRefreshTimer();
    trailScheduledAtRef.current = scheduledAt;
    trailRefreshTimeoutRef.current = setTimeout(() => {
      trailRefreshTimeoutRef.current = null;
      trailScheduledAtRef.current = null;
      void refreshChildTrail(selectedChild.id, "throttled");
    }, delayMs);

    return () => {
      clearTrailRefreshTimer();
    };
  }, [
    effectiveSelectedChildId,
    isHomeFocused,
    clearTrailRefreshTimer,
    refreshChildTrail,
    selectedChild,
    selectedChildTrailKey,
    trailByChildId,
  ]);

  useEffect(() => {
    if (
      !selectedChild ||
      !isHomeFocused ||
      !homeMapResumeReadyRef.current ||
      !isMapReadyRef.current
    ) {
      return;
    }

    if (lastSelectedChildIdRef.current === effectiveSelectedChildId) {
      return;
    }

    lastSelectedChildIdRef.current = effectiveSelectedChildId;

    if (!selectedChild.hasLocationFix) {
      lastFollowedCoordinateRef.current = null;
      mapRef.current?.animateToRegion(defaultRegion, 350);
      return;
    }

    lastFollowedCoordinateRef.current = `${selectedChild.id}:${selectedChild.latitude ?? ""}:${selectedChild.longitude ?? ""}`;
    mapRef.current?.animateToRegion(
      getChromeAwareChildRegion({
        bottomNavHeight: bottomNavigationHeight,
        child: selectedChild,
        chromeVisible: chromeVisibleForCamera,
        isFullscreen: isMapFullscreen,
        secondaryTopChromeHeight,
        summaryBottomOffset,
        summaryHeight,
        telemetryHeight,
        topBarHeight,
        windowHeight,
        zoom: "focused",
      }),
      350,
    );
  }, [
    bottomNavigationHeight,
    chromeVisibleForCamera,
    isHomeFocused,
    isMapFullscreen,
    secondaryTopChromeHeight,
    selectedChild,
    effectiveSelectedChildId,
    summaryBottomOffset,
    summaryHeight,
    telemetryHeight,
    topBarHeight,
    windowHeight,
  ]);

  function clearMapRestoreTimer() {
    if (mapInteractionRestoreTimeoutRef.current) {
      clearTimeout(mapInteractionRestoreTimeoutRef.current);
      mapInteractionRestoreTimeoutRef.current = null;
    }
  }

  function clearMapFullscreenTransitionTimer() {
    if (mapFullscreenTransitionTimeoutRef.current) {
      clearTimeout(mapFullscreenTransitionTimeoutRef.current);
      mapFullscreenTransitionTimeoutRef.current = null;
    }
  }

  function clearMapFullscreenEntryAnimationFrame() {
    if (mapFullscreenEntryAnimationFrameRef.current != null) {
      cancelAnimationFrame(mapFullscreenEntryAnimationFrameRef.current);
      mapFullscreenEntryAnimationFrameRef.current = null;
    }
  }

  function setFollowMode(enabled: boolean) {
    followChildLocationRef.current = enabled;
    setIsFollowingChild((current) => (current === enabled ? current : enabled));
  }

  function startMapInteraction() {
    lastMapInteractionAtRef.current = Date.now();
    clearMapRestoreTimer();

    if (mapInteractionActiveRef.current) {
      return;
    }

    mapInteractionActiveRef.current = true;
    setIsMapInteracting(true);
  }

  function scheduleMapInteractionRestore() {
    clearMapRestoreTimer();

    mapInteractionRestoreTimeoutRef.current = setTimeout(() => {
      mapInteractionActiveRef.current = false;
      setIsMapInteracting(false);
      mapInteractionRestoreTimeoutRef.current = null;
    }, MAP_INTERACTION_RESTORE_DELAY);
  }

  const getTargetRegion = React.useCallback(
    (child: OverviewChildCard, zoom: "default" | "focused") => {
      return getChromeAwareChildRegion({
        bottomNavHeight: bottomNavigationHeight,
        child,
        chromeVisible: chromeVisibleForCamera,
        isFullscreen: isMapFullscreen,
        secondaryTopChromeHeight,
        summaryBottomOffset,
        summaryHeight,
        telemetryHeight,
        topBarHeight,
        windowHeight,
        zoom,
      });
    },
    [
      bottomNavigationHeight,
      chromeVisibleForCamera,
      isMapFullscreen,
      secondaryTopChromeHeight,
      summaryBottomOffset,
      summaryHeight,
      telemetryHeight,
      topBarHeight,
      windowHeight,
    ],
  );

  const animateToChildRegion = React.useCallback(
    (child: OverviewChildCard, zoom: "default" | "focused") => {
      if (!homeMapResumeReadyRef.current) {
        return;
      }

      mapRef.current?.animateToRegion(getTargetRegion(child, zoom), 350);
    },
    [getTargetRegion],
  );

  const animateToChildRegionImmediately = React.useCallback(
    (child: OverviewChildCard, zoom: "default" | "focused") => {
      mapRef.current?.animateToRegion(getTargetRegion(child, zoom), 350);
    },
    [getTargetRegion],
  );

  const focusPendingFirstFix = React.useCallback(() => {
    const pendingChildId = pendingFirstFixFocusChildIdRef.current;

    if (
      !pendingChildId ||
      !selectedChild ||
      selectedChild.id !== pendingChildId ||
      !selectedChild.hasLocationFix ||
      selectedChild.latitude == null ||
      selectedChild.longitude == null ||
      !isHomeFocusedRef.current ||
      !homeMapResumeReadyRef.current ||
      !isMapReadyRef.current ||
      selectedGeofence.status === "editing"
    ) {
      return false;
    }

    pendingFirstFixFocusChildIdRef.current = null;
    hasAppliedInitialFocusRef.current = true;
    lastSelectedChildIdRef.current = selectedChild.id;
    lastFollowedCoordinateRef.current = `${selectedChild.id}:${selectedChild.latitude}:${selectedChild.longitude}`;
    animateToChildRegionImmediately(selectedChild, "focused");
    return true;
  }, [animateToChildRegionImmediately, selectedChild, selectedGeofence.status]);

  useEffect(() => {
    if (!selectedChild) {
      pendingFirstFixFocusChildIdRef.current = null;
      return;
    }

    if (
      pendingFirstFixFocusChildIdRef.current &&
      pendingFirstFixFocusChildIdRef.current !== selectedChild.id
    ) {
      pendingFirstFixFocusChildIdRef.current = null;
    }

    const previousHasLocationFix =
      observedLocationFixByChildIdRef.current[selectedChild.id];
    observedLocationFixByChildIdRef.current[selectedChild.id] =
      selectedChild.hasLocationFix;

    if (previousHasLocationFix !== false || !selectedChild.hasLocationFix) {
      return;
    }

    pendingFirstFixFocusChildIdRef.current = selectedChild.id;
    setFollowMode(true);
    lastFollowedCoordinateRef.current = null;
    clearMapRestoreTimer();
    mapInteractionActiveRef.current = false;
    setIsMapInteracting(false);
    focusPendingFirstFix();
  }, [focusPendingFirstFix, selectedChild]);

  useEffect(() => {
    focusPendingFirstFix();
  }, [focusPendingFirstFix, homeMapResumeReadyVersion, isHomeFocused]);

  function handleMapReady() {
    if (!selectedChild) {
      return;
    }

    isMapReadyRef.current = true;

    if (focusPendingFirstFix()) {
      return;
    }

    if (!selectedChild.hasLocationFix) {
      hasAppliedInitialFocusRef.current = false;
      return;
    }

    if (selectedGeofence.status === "editing") {
      hasAppliedInitialFocusRef.current = true;
      if (homeMapResumeReadyRef.current) {
        flushGeofenceCameraFit();
      }
      return;
    }

    if (hasAppliedInitialFocusRef.current) {
      return;
    }

    hasAppliedInitialFocusRef.current = true;
    lastSelectedChildIdRef.current = effectiveSelectedChildId;
    lastFollowedCoordinateRef.current = `${selectedChild.id}:${selectedChild.latitude ?? ""}:${selectedChild.longitude ?? ""}`;
    animateToChildRegionImmediately(selectedChild, "focused");
  }

  function handleExpandMap() {
    if (
      isMapInteracting ||
      isMapFullscreenAnimating ||
      Date.now() - lastMapInteractionAtRef.current < MAP_TAP_GUARD_MS
    ) {
      return;
    }

    clearMapRestoreTimer();
    clearMapFullscreenTransitionTimer();
    clearMapFullscreenEntryAnimationFrame();
    setMapFullscreenPhase("entering");
    mapFullscreenTransitionTimeoutRef.current = setTimeout(() => {
      setIsMapFullscreen(true);
      setMapFullscreenPhase("idle");
      mapFullscreenTransitionTimeoutRef.current = null;
    }, MAP_FULLSCREEN_TRANSITION_MS);
  }

  function handleCollapseMap() {
    if (!isMapFullscreen && mapFullscreenPhase === "idle") {
      return;
    }

    clearMapRestoreTimer();
    clearMapFullscreenTransitionTimer();
    clearMapFullscreenEntryAnimationFrame();
    setIsMapFullscreen(false);
    setMapFullscreenPhase("exiting");
    mapFullscreenEntryAnimationFrameRef.current = requestAnimationFrame(() => {
      setMapFullscreenPhase("idle");
      mapFullscreenEntryAnimationFrameRef.current = null;
    });
  }

  function handleMapPress() {
    if (
      isMapInteracting ||
      isMapFullscreenAnimating ||
      Date.now() - lastMapInteractionAtRef.current < MAP_TAP_GUARD_MS
    ) {
      return;
    }

    if (isMapFullscreen) {
      handleCollapseMap();
      return;
    }

    handleExpandMap();
  }

  function handleRecenterMap() {
    if (!selectedChild) {
      return;
    }

    setFollowMode(true);
    lastFollowedCoordinateRef.current = null;
    animateToChildRegionImmediately(selectedChild, "focused");
  }

  async function handleThemeToggle(origin: ThemeToggleOrigin) {
    await runThemeTransition({
      origin,
      settleDelayMs: THEME_TRANSITION_SETTLE_DELAY_MS_HOME,
      targetTheme: getRuntimeThemeName() === "dark" ? "light" : "dark",
    });
  }

  useEffect(() => {
    if (
      !selectedChild ||
      !selectedChild.hasLocationFix ||
      !isMapReadyRef.current ||
      !isFollowingChild ||
      isMapInteracting
    ) {
      return;
    }

    if (selectedChild.latitude == null || selectedChild.longitude == null) {
      return;
    }

    const coordinateKey = `${selectedChild.id}:${selectedChild.latitude}:${selectedChild.longitude}`;

    if (lastFollowedCoordinateRef.current === coordinateKey) {
      return;
    }

    lastFollowedCoordinateRef.current = coordinateKey;
    animateToChildRegion(selectedChild, "focused");
  }, [animateToChildRegion, isFollowingChild, isMapInteracting, selectedChild]);

  function handleMapTouchStart(activeTouchCount: number) {
    mapActiveTouchCountRef.current = activeTouchCount;
    clearMapRestoreTimer();

    if (activeTouchCount >= 2) {
      mapMultiTouchGestureRef.current = true;
      setFollowMode(false);
      startMapInteraction();
    }
  }

  function handleMapTouchMove(activeTouchCount: number) {
    mapActiveTouchCountRef.current = activeTouchCount;

    if (activeTouchCount >= 2) {
      mapMultiTouchGestureRef.current = true;
      setFollowMode(false);
      startMapInteraction();
    }
  }

  function handleMapTouchEnd(activeTouchCount: number) {
    mapActiveTouchCountRef.current = activeTouchCount;

    if (activeTouchCount > 0) {
      return;
    }

    mapMultiTouchGestureRef.current = false;

    if (mapInteractionActiveRef.current) {
      scheduleMapInteractionRestore();
    }
  }

  function handleMapTouchCancel() {
    mapActiveTouchCountRef.current = 0;
    mapMultiTouchGestureRef.current = false;

    if (mapInteractionActiveRef.current) {
      scheduleMapInteractionRestore();
    }
  }

  function handleMapGestureStart(isUserGesture = false) {
    if (isUserGesture) {
      setFollowMode(false);
    }

    if (
      mapMultiTouchGestureRef.current ||
      mapActiveTouchCountRef.current >= 2
    ) {
      startMapInteraction();
    }
  }

  function handleMapGestureComplete() {
    if (mapActiveTouchCountRef.current > 0) {
      return;
    }

    if (mapInteractionActiveRef.current) {
      scheduleMapInteractionRestore();
    }
  }

  // PastelMap is React.memo'd but was re-rendering on every parent render because
  // these were plain function declarations with a fresh identity each time.
  // Stable wrappers let the memo (and the whole MapView child tree) bail out.
  const stableMapGestureComplete = useStableCallback(handleMapGestureComplete);
  const stableMapGestureStart = useStableCallback(handleMapGestureStart);
  const stableMapPress = useStableCallback(handleMapPress);
  const stableMapReady = useStableCallback(handleMapReady);
  const stableMapTouchCancel = useStableCallback(handleMapTouchCancel);
  const stableMapTouchEnd = useStableCallback(handleMapTouchEnd);
  const stableMapTouchMove = useStableCallback(handleMapTouchMove);
  const stableMapTouchStart = useStableCallback(handleMapTouchStart);
  const stableGeofenceActionPress = useStableCallback(() => {
    handleGeofenceActionPress();
  });
  const stableGeofenceRadiusInteractionStart = useStableCallback(() => {
    geofenceRadiusDrag.onInteractionStart();
  });
  const stableOpenShareSheet = useStableCallback(handleOpenShareSheet);
  const stableRecenterMap = useStableCallback(handleRecenterMap);

  function handleTopBarLayout(event: LayoutChangeEvent) {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    setTopBarHeight((current) =>
      Math.abs(current - nextHeight) >= 1 ? nextHeight : current,
    );
  }

  function handleSecondaryTopChromeLayout(event: LayoutChangeEvent) {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    setSecondaryTopChromeHeight((current) =>
      Math.abs(current - nextHeight) >= 1 ? nextHeight : current,
    );
  }

  function handleTelemetryLayout(event: LayoutChangeEvent) {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    setTelemetryHeight((current) =>
      Math.abs(current - nextHeight) >= 1 ? nextHeight : current,
    );
  }

  function handleSummaryLayout(event: LayoutChangeEvent) {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    setSummaryHeight((current) =>
      Math.abs(current - nextHeight) >= 1 ? nextHeight : current,
    );
    if (
      selectedChild
      && selectedGeofence.status === "editing"
      && !isGeofenceRadiusDragging
    ) {
      scheduleGeofenceCameraFit({
        center: visibleGeofenceCenter,
        childId: selectedChild.id,
        editorHeight: nextHeight,
        radiusMeters: visibleGeofenceRadius ?? 0,
      });
    }
  }

  const updateSelectedChildGeofence = React.useCallback(
    (updater: (state: ChildGeofenceState) => ChildGeofenceState) => {
      if (!selectedChild) {
        return;
      }

      setGeofenceDraftsByChildId((current) => {
        const existingState =
          current[selectedChild.id] ??
          (selectedRawChild
            ? toGeofenceState(selectedRawChild.geofence)
            : createDefaultGeofenceState());
        const nextState = updater(existingState);

        // The native slider emits onValueChange on every pointer-move frame
        // (~60-120Hz), not once per step, and does not dedupe against the
        // previous snapped value. Without this guard every one of those frames
        // committed a full HomeScreen render.
        if (nextState === existingState) {
          return current;
        }

        return {
          ...current,
          [selectedChild.id]: nextState,
        };
      });
    },
    [selectedChild, selectedRawChild],
  );

  function cancelSelectedChildGeofenceEdit() {
    if (!selectedChild || selectedGeofence.status !== "editing") {
      return false;
    }

    geofenceRadiusDrag.cancel();
    clearGeofenceDraft(selectedChild.id);
    setGeofenceError(null);
    return true;
  }

  useEffect(() => {
    const currentStatus = selectedGeofence.status;
    const currentChildId = selectedChild?.id ?? null;
    const previousStatus = previousGeofenceStatusRef.current;
    const editingChildId = geofenceEditChildIdRef.current;

    if (
      previousStatus === "editing" &&
      editingChildId &&
      editingChildId !== currentChildId
    ) {
      cancelGeofenceCameraFit();
      geofenceEditPreviousFollowModeRef.current = null;
      geofenceEditChildIdRef.current = null;
    }

    if (currentStatus === "editing" && currentChildId && selectedChild) {
      const isEnteringEdit =
        previousStatus !== "editing" || editingChildId !== currentChildId;

      if (isEnteringEdit) {
        geofenceEditPreviousFollowModeRef.current =
          followChildLocationRef.current;
        geofenceEditChildIdRef.current = currentChildId;
        setFollowMode(false);
      }
    } else if (
      previousStatus === "editing" &&
      editingChildId &&
      editingChildId === currentChildId &&
      selectedChild
    ) {
      cancelGeofenceCameraFit();
      animateToChildRegion(selectedChild, "focused");
      if (geofenceEditPreviousFollowModeRef.current != null) {
        setFollowMode(geofenceEditPreviousFollowModeRef.current);
      }
      geofenceEditPreviousFollowModeRef.current = null;
      geofenceEditChildIdRef.current = null;
    }

    previousGeofenceStatusRef.current = currentStatus;
  }, [
    animateToChildRegion,
    cancelGeofenceCameraFit,
    selectedChild,
    selectedGeofence.status,
  ]);

  useEffect(() => {
    if (!isMapFullscreen) {
      return;
    }

    cancelGeofenceCameraFit();
  }, [cancelGeofenceCameraFit, isMapFullscreen]);

  function restoreGeofenceDraft(
    childId: string,
    draft: ChildGeofenceState | null,
  ) {
    if (!draft) {
      clearGeofenceDraft(childId);
      return;
    }

    setGeofenceDraftsByChildId((current) => ({
      ...current,
      [childId]: draft,
    }));
  }

  function confirmGeofenceTransaction(
    childId: string,
    mutationId: string,
    serverGeofence: ChildGeofenceDto,
  ) {
    if (!hasMatchingGeofenceTransaction(childId, mutationId)) {
      return false;
    }

    commitGeofenceUiAction({
      type: "confirm",
      childId,
      mutationId,
      serverGeofence,
    });
    commitGeofenceUiAction({
      type: "install-stale-guard",
      childId,
      geofence: serverGeofence,
    });
    writeRawOverviewChildGeofence(childId, serverGeofence);
    commitGeofenceUiAction({
      type: "complete",
      childId,
      mutationId,
    });
    return true;
  }

  function rollbackGeofenceTransaction(
    childId: string,
    mutationId: string,
    previousDraft: ChildGeofenceState | null,
    previousGeofence: ChildGeofenceDto,
  ) {
    if (!hasMatchingGeofenceTransaction(childId, mutationId)) {
      return false;
    }

    commitGeofenceUiAction({
      type: "rollback",
      childId,
      mutationId,
    });
    restoreGeofenceDraft(childId, previousDraft);
    writeRawOverviewChildGeofence(childId, previousGeofence);
    return true;
  }

  const disableGeofenceMutation = useMutation({
    mutationFn: ({
      childId,
    }: {
      childId: string;
      mutationId: string;
      startedAt: number;
      optimisticGeofence: ChildGeofenceDto;
      previousDraft: ChildGeofenceState | null;
      previousGeofence: ChildGeofenceDto;
    }) =>
      updateChildGeofence(
        childId,
        {
          status: "disabled",
        },
        {
          operationName: "disableChildGeofence",
        },
      ),
    onMutate: async (variables) => {
      if (organizationId) {
        await queryClient.cancelQueries({
          queryKey: queryKeys.overview(organizationId),
        });
      }
      return variables;
    },
    onSuccess: (geofence, variables, context) => {
      if (
        !confirmGeofenceTransaction(
          variables.childId,
          variables.mutationId,
          geofence,
        )
      ) {
        return;
      }

      if (__DEV__) {
        console.info("[geofence] mutation completed", {
          action: "disable",
          childId: variables.childId,
          mutationId: variables.mutationId,
          durationMs: Date.now() - variables.startedAt,
        });
      }
    },
    onError: (error, variables) => {
      if (
        !rollbackGeofenceTransaction(
          variables.childId,
          variables.mutationId,
          variables.previousDraft,
          variables.previousGeofence,
        )
      ) {
        return;
      }

      setGeofenceError(
        error instanceof Error
          ? error.message
          : "Failed to disable the safe zone.",
      );

      if (__DEV__) {
        console.warn("[geofence] mutation rolled back", {
          action: "disable",
          childId: variables.childId,
          mutationId: variables.mutationId,
          durationMs: Date.now() - variables.startedAt,
        });
      }
    },
    onSettled: (_data, _error, variables) => {
      if (savingGeofenceForChildId === variables.childId) {
        setSavingGeofenceForChildId(null);
      } else {
        setSavingGeofenceForChildId((current) =>
          current === variables.childId ? null : current,
        );
      }
    },
  });

  const saveGeofenceMutation = useMutation({
    mutationFn: ({
      childId,
      input,
    }: {
      childId: string;
      mutationId: string;
      startedAt: number;
      input: {
        centerLatitude: number;
        centerLongitude: number;
        radiusMeters: number;
      };
      optimisticGeofence: ChildGeofenceDto;
      previousDraft: ChildGeofenceState | null;
      previousGeofence: ChildGeofenceDto;
    }) =>
      updateChildGeofence(
        childId,
        {
          status: "enabled",
          centerLatitude: input.centerLatitude,
          centerLongitude: input.centerLongitude,
          radiusMeters: input.radiusMeters,
        },
        {
          operationName: "saveChildGeofence",
        },
      ),
    onMutate: async (variables) => {
      if (organizationId) {
        await queryClient.cancelQueries({
          queryKey: queryKeys.overview(organizationId),
        });
      }
      return variables;
    },
    onSuccess: (geofence, variables, context) => {
      if (
        !confirmGeofenceTransaction(
          variables.childId,
          variables.mutationId,
          geofence,
        )
      ) {
        return;
      }

      if (__DEV__) {
        console.info("[geofence] mutation completed", {
          action: "save",
          childId: variables.childId,
          mutationId: variables.mutationId,
          durationMs: Date.now() - variables.startedAt,
        });
      }
    },
    onError: (error, variables) => {
      if (
        !rollbackGeofenceTransaction(
          variables.childId,
          variables.mutationId,
          variables.previousDraft,
          variables.previousGeofence,
        )
      ) {
        return;
      }

      setGeofenceError(
        error instanceof Error
          ? error.message
          : "Failed to update the safe zone.",
      );

      if (__DEV__) {
        console.warn("[geofence] mutation rolled back", {
          action: "save",
          childId: variables.childId,
          mutationId: variables.mutationId,
          durationMs: Date.now() - variables.startedAt,
        });
      }
    },
    onSettled: (_data, _error, variables) => {
      setSavingGeofenceForChildId((current) =>
        current === variables.childId ? null : current,
      );
    },
  });

  const resetGeofenceMutation = useMutation({
    mutationFn: ({
      childId,
    }: {
      childId: string;
      mutationId: string;
      startedAt: number;
      attemptedLastSeenAt: string;
      optimisticGeofence: ChildGeofenceDto;
      previousDraft: ChildGeofenceState | null;
      previousGeofence: ChildGeofenceDto;
    }) =>
      resetChildGeofence(childId, {
        operationName: "resetChildGeofence",
      }),
    onMutate: async (variables) => {
      if (organizationId) {
        await queryClient.cancelQueries({
          queryKey: queryKeys.overview(organizationId),
        });
      }
      return variables;
    },
    onSuccess: (geofence, variables, context) => {
      if (
        !confirmGeofenceTransaction(
          variables.childId,
          variables.mutationId,
          geofence,
        )
      ) {
        return;
      }

      if (__DEV__) {
        console.info("[geofence] mutation completed", {
          action: "reset",
          childId: variables.childId,
          mutationId: variables.mutationId,
          durationMs: Date.now() - variables.startedAt,
        });
      }

      setResetUnavailableAtByChildId((current) => {
        if (!(variables.childId in current)) {
          return current;
        }

        const next = { ...current };
        delete next[variables.childId];
        return next;
      });
    },
    onError: (error, variables) => {
      if (
        !rollbackGeofenceTransaction(
          variables.childId,
          variables.mutationId,
          variables.previousDraft,
          variables.previousGeofence,
        )
      ) {
        return;
      }

      if (
        error instanceof ApiError
        && (error.code === "LOCATION_STALE"
          || error.code === "LOCATION_UNAVAILABLE")
      ) {
        setResetUnavailableAtByChildId((current) => ({
          ...current,
          [variables.childId]: variables.attemptedLastSeenAt,
        }));
        setTelemetryNowMs(Date.now());
        setGeofenceError(null);
        return;
      }

      setGeofenceError(
        error instanceof Error
          ? error.message
          : "Failed to reset the safe zone.",
      );

      if (__DEV__) {
        console.warn("[geofence] mutation rolled back", {
          action: "reset",
          childId: variables.childId,
          mutationId: variables.mutationId,
          durationMs: Date.now() - variables.startedAt,
        });
      }
    },
    onSettled: (_data, _error, variables) => {
      setSavingGeofenceForChildId((current) =>
        current === variables.childId ? null : current,
      );
    },
  });

  function confirmDisableGeofence() {
    if (!selectedChild || !selectedRawChild || savingGeofenceForChildId) {
      return;
    }

    Alert.alert(
      "Disable geofence?",
      `You will stop receiving safe zone alerts for ${selectedChild.name}.`,
      [
        {
          style: "cancel",
          text: "Cancel",
        },
        {
          style: "destructive",
          text: "Disable",
          onPress: () => {
            const optimisticGeofence = createOptimisticDisabledGeofence(
              selectedRawChild.geofence,
            );
            const previousDraft =
              geofenceDraftsByChildId[selectedChild.id] ?? null;
            const previousGeofence = selectedRawChild.geofence;
            const transaction = beginGeofenceTransaction({
              action: "disable",
              childId: selectedChild.id,
              optimisticGeofence,
              previousDraft,
              previousGeofence,
            });

            disableGeofenceMutation.mutate({
              childId: selectedChild.id,
              mutationId: transaction.mutationId,
              startedAt: transaction.startedAt,
              optimisticGeofence,
              previousDraft,
              previousGeofence,
            });
          },
        },
      ],
    );
  }

  function handleResetGeofence() {
    if (!selectedChild || !selectedRawChild) {
      return;
    }

    const attemptedLastSeenAt = selectedChild.lastSeenAt;
    if (
      !attemptedLastSeenAt
      || !isGeofenceResetLocationFresh(attemptedLastSeenAt, Date.now())
      || resetUnavailableAtByChildId[selectedChild.id] === attemptedLastSeenAt
    ) {
      confirmDisableGeofence();
      return;
    }

    const previousDraft = geofenceDraftsByChildId[selectedChild.id] ?? null;
    const previousGeofence = selectedRawChild.geofence;
    const optimisticGeofence = createOptimisticResetGeofence(previousGeofence, {
      centerLatitude: selectedChild.latitude,
      centerLongitude: selectedChild.longitude,
      occurredAt: new Date().toISOString(),
    });
    const transaction = beginGeofenceTransaction({
      action: "reset",
      childId: selectedChild.id,
      optimisticGeofence,
      previousDraft,
      previousGeofence,
    });

    resetGeofenceMutation.mutate({
      childId: selectedChild.id,
      mutationId: transaction.mutationId,
      startedAt: transaction.startedAt,
      attemptedLastSeenAt,
      optimisticGeofence,
      previousDraft,
      previousGeofence,
    });
  }

  function handleGeofenceActionPress() {
    if (!selectedChild || savingGeofenceForChildId || !canManageGeofences) {
      return;
    }

    const state =
      geofencesByChildId[selectedChild.id] ?? createDefaultGeofenceState();

    if (state.status === "unset") {
      updateSelectedChildGeofence((current) => ({
        ...current,
        editOriginStatus: "unset",
        radiusMeters:
          current.savedRadiusMeters ?? DEFAULT_GEOFENCE_RADIUS_METERS,
        radiusUnit: "m",
        status: "editing",
      }));
      return;
    }

    if (state.status === "editing") {
      if (!selectedRawChild) {
        return;
      }

      let center: { latitude: number; longitude: number };

      if (
        state.editOriginStatus === "unset" ||
        state.editOriginStatus === "disabled" ||
        state.centerLatitude == null ||
        state.centerLongitude == null
      ) {
        center = getSelectedChildCenter(selectedChild);
      } else {
        center = {
          latitude: state.centerLatitude,
          longitude: state.centerLongitude,
        };
      }
      const radiusMeters = clampGeofenceRadius(
        state.radiusMeters,
        state.radiusUnit,
      );
      const previousDraft = geofenceDraftsByChildId[selectedChild.id] ?? state;
      const previousGeofence = selectedRawChild.geofence;
      const optimisticGeofence = createOptimisticEnabledGeofence(
        previousGeofence,
        {
          centerLatitude: center.latitude,
          centerLongitude: center.longitude,
          radiusMeters,
        },
      );
      const transaction = beginGeofenceTransaction({
        action: "save",
        childId: selectedChild.id,
        optimisticGeofence,
        previousDraft,
        previousGeofence,
      });
      saveGeofenceMutation.mutate({
        childId: selectedChild.id,
        mutationId: transaction.mutationId,
        startedAt: transaction.startedAt,
        input: {
          centerLatitude: center.latitude,
          centerLongitude: center.longitude,
          radiusMeters,
        },
        optimisticGeofence,
        previousDraft,
        previousGeofence,
      });
      return;
    }

    if (state.status === "breached") {
      confirmDisableGeofence();
      return;
    }

    if (state.status === "enabled") {
      confirmDisableGeofence();
      return;
    }

    if (!selectedRawChild) {
      return;
    }

    const radiusMeters = clampGeofenceRadius(
      state.savedRadiusMeters ?? state.radiusMeters,
      state.radiusUnit,
    );
    const previousDraft = geofenceDraftsByChildId[selectedChild.id] ?? null;
    const previousGeofence = selectedRawChild.geofence;
    const optimisticGeofence = createOptimisticEnabledGeofence(
      previousGeofence,
      {
        centerLatitude: selectedChild.latitude,
        centerLongitude: selectedChild.longitude,
        radiusMeters,
      },
    );
    const transaction = beginGeofenceTransaction({
      action: "save",
      childId: selectedChild.id,
      optimisticGeofence,
      previousDraft,
      previousGeofence,
    });
    saveGeofenceMutation.mutate({
      childId: selectedChild.id,
      mutationId: transaction.mutationId,
      startedAt: transaction.startedAt,
      input: {
        centerLatitude: selectedChild.latitude,
        centerLongitude: selectedChild.longitude,
        radiusMeters,
      },
      optimisticGeofence,
      previousDraft,
      previousGeofence,
    });
  }

  function handleGeofenceStatusActionPress() {
    if (!selectedChild || savingGeofenceForChildId || !canManageGeofences) {
      return;
    }

    const state =
      geofencesByChildId[selectedChild.id] ?? createDefaultGeofenceState();

    if (state.status === "breached") {
      if (selectedBreachAction === "reset") {
        handleResetGeofence();
      } else {
        confirmDisableGeofence();
      }
      return;
    }

    updateSelectedChildGeofence((state) => {
      if (state.status === "editing") {
        return state;
      }

      return {
        ...state,
        editOriginStatus: state.status,
        radiusMeters: state.savedRadiusMeters ?? DEFAULT_GEOFENCE_RADIUS_METERS,
        status: "editing",
      };
    });
  }

  function handleGeofenceRadiusCommit(commit: GeofenceRadiusCommit) {
    if (!selectedChild || selectedGeofence.status !== "editing") {
      return;
    }

    const previousRadiusMeters = clampGeofenceRadius(
      commit.fromRadiusMeters,
      selectedGeofence.radiusUnit,
    );
    const nextRadiusMeters = clampGeofenceRadius(
      commit.toRadiusMeters,
      selectedGeofence.radiusUnit,
    );

    if (nextRadiusMeters === previousRadiusMeters) {
      return;
    }

    updateSelectedChildGeofence((state) => {
      const nextStateRadiusMeters = clampGeofenceRadius(
        nextRadiusMeters,
        state.radiusUnit,
      );

      // Returning the same object short-circuits the state update entirely.
      if (nextStateRadiusMeters === state.radiusMeters) {
        return state;
      }

      return { ...state, radiusMeters: nextStateRadiusMeters };
    });

    // Finger-up publishes one state transaction and starts one animated fit.
    // The shared Skia ring is already displaying the final radius.
    if (!isMapFullscreen) {
      scheduleGeofenceCameraFit(
        {
          center: visibleGeofenceCenter,
          childId: selectedChild.id,
          editorHeight: summaryHeight,
          radiusMeters: nextRadiusMeters,
        },
        { immediate: true },
      );
    }
  }

  function handleGeofenceRadiusUnitChange(radiusUnit: GeofenceRadiusUnit) {
    if (selectedGeofence.radiusUnit === radiusUnit) {
      return;
    }

    updateSelectedChildGeofence((state) => {
      if (state.radiusUnit === radiusUnit) {
        return state;
      }

      return {
        ...state,
        radiusMeters: clampGeofenceRadius(state.radiusMeters, radiusUnit),
        radiusUnit,
      };
    });

  }

  async function handleShareDurationSelect(
    durationMinutes: ShareDurationMinutes,
  ) {
    if (!selectedChild || isCreatingShareLink) {
      return;
    }

    setIsCreatingShareLink(true);
    setShareErrorMessage(null);

    try {
      const shareLink = await createChildShareLink(selectedChild.id, {
        durationMinutes,
      });

      pendingNativeShareRef.current = {
        childName: selectedChild.name,
        expiryMessage: `This link expires in ${formatShareDurationLabel(durationMinutes)}.`,
        url: shareLink.shareUrl,
      };
      queryClient.setQueryData(queryKeys.activeChildShare(selectedChild.id), {
        share: shareLink,
      });
      setIsShareSheetVisible(false);
    } catch (error) {
      if (error instanceof ApiError) {
        setShareErrorMessage(error.message);
      } else {
        setShareErrorMessage("Failed to create the share link.");
      }

      if (__DEV__) {
        console.warn("Share location failed", error);
      }
      return;
    } finally {
      setIsCreatingShareLink(false);
    }

    if (Platform.OS !== "ios") {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void openPendingNativeShare();
        });
      });
    }
  }

  function handleShareCurrentLink() {
    if (!selectedChild || !activeShare || isCreatingShareLink || isStoppingShareLink) {
      return;
    }

    pendingNativeShareRef.current = {
      childName: selectedChild.name,
      expiryMessage: `This link expires at ${new Date(activeShare.expiresAt).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })}.`,
      url: activeShare.shareUrl,
    };
    setIsShareSheetVisible(false);

    if (Platform.OS !== "ios") {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void openPendingNativeShare();
        });
      });
    }
  }

  function handleStopSharing() {
    if (!selectedChild || !activeShare || isCreatingShareLink || isStoppingShareLink) {
      return;
    }

    const firstName = selectedChild.name.split(/\s+/)[0] ?? selectedChild.name;
    Alert.alert(
      'Stop sharing live location?',
      `The current link to ${firstName}'s location will stop working immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop sharing',
          style: 'destructive',
          onPress: () => {
            setIsStoppingShareLink(true);
            setShareErrorMessage(null);
            void revokeChildShareLink(selectedChild.id, activeShare.id)
              .then(() => {
                queryClient.setQueryData(
                  queryKeys.activeChildShare(selectedChild.id),
                  { share: null },
                );
                setIsShareSheetVisible(false);
                setShareSheetMode('create');
              })
              .catch((error) => {
                setShareErrorMessage(
                  error instanceof ApiError
                    ? error.message
                    : 'Failed to stop live location sharing.',
                );
              })
              .finally(() => setIsStoppingShareLink(false));
          },
        },
      ],
    );
  }

  async function openPendingNativeShare() {
    const pendingShare = pendingNativeShareRef.current;

    if (!pendingShare) {
      return;
    }

    pendingNativeShareRef.current = null;
    const firstName =
      pendingShare.childName.split(/\s+/)[0] ?? pendingShare.childName;
    const intro = `View ${firstName}'s live location. ${pendingShare.expiryMessage}`;

    try {
      await Share.share(
        Platform.OS === "ios"
          ? {
              title: `${pendingShare.childName}'s live location`,
              message: intro,
              url: pendingShare.url,
            }
          : {
              title: `${pendingShare.childName}'s live location`,
              message: `${intro} ${pendingShare.url}`,
            },
      );
    } catch (error) {
      if (__DEV__) {
        console.warn("Share sheet failed", error);
      }
      Alert.alert("Share failed", "The share sheet could not be opened.");
    }
  }

  return (
    <SafeAreaView edges={[]} style={styles.safeArea}>
      <StatusBar style={statusBarThemeName === "dark" ? "light" : "dark"} />
      <View style={styles.container}>
        <BlurTargetView
          accessibilityElementsHidden={isFirstLocationGateBlocking}
          importantForAccessibility={
            isFirstLocationGateBlocking ? "no-hide-descendants" : "auto"
          }
          ref={firstLocationBlurTargetRef}
          style={styles.blurTarget}
        >
        {selectedChild ? (
          <View pointerEvents="box-none" style={styles.mapLayer(0)}>
            <PastelMap
              active={isHomeFocused}
              bottomInset={insets.bottom}
              chromeHidden={isMapInteracting}
              controlsHidden={controlsHidden}
              controlsTopOffset={mapControlsTopOffset}
              floatingBottomOffset={floatingBottomOffset}
              geofenceButtonState={selectedGeofence.status}
              geofenceCenterLatitude={visibleGeofenceCenter.latitude}
              geofenceCenterLongitude={visibleGeofenceCenter.longitude}
              geofenceLiveRadiusMeters={geofenceRadiusDrag.liveRadiusMeters}
              geofenceRadiusPending={isGeofenceRadiusDragging}
              geofenceRadiusMeters={mapGeofenceRadius}
              geofenceVisible={
                !isWaitingForFirstLocation &&
                (selectedGeofence.status === "enabled" ||
                  selectedGeofence.status === "editing" ||
                  selectedGeofence.status === "breached")
              }
              initialRegion={initialMapRegion}
              isFollowingChild={isFollowingChild}
              isFullscreen={isMapFullscreen}
              mapRef={mapRef}
              onMapGestureComplete={stableMapGestureComplete}
              onMapGestureStart={stableMapGestureStart}
              onMapPress={stableMapPress}
              onMapReady={stableMapReady}
              onMapTouchCancel={stableMapTouchCancel}
              onMapTouchEnd={stableMapTouchEnd}
              onMapTouchMove={stableMapTouchMove}
              onMapTouchStart={stableMapTouchStart}
              onSafetyPress={stableGeofenceActionPress}
              onSharePress={stableOpenShareSheet}
              onTargetPress={stableRecenterMap}
              selectedChild={selectedChild}
              trailLiveSamples={selectedChildLiveTrailSamples}
              trail={selectedChildTrail}
              shareDisabled={
                isCreatingShareLink ||
                isStoppingShareLink ||
                activeShareQuery.isPending ||
                isWaitingForFirstLocation
              }
              showLocation={!isWaitingForFirstLocation}
              showShareControl={
                canUseLiveSharing && !isWaitingForFirstLocation
              }
              themeTransitionActive={isTransitioning}
              themeTransitionTargetTheme={transitionTargetTheme}
            />
          </View>
        ) : (
          <View style={styles.emptyState}>
            {isLoading ? (
              <ShoeLoader size={70} />
            ) : (
              <Text style={styles.emptyStateTitle}>
                No child is connected yet.
              </Text>
            )}
            {errorMessage ? (
              <Text style={styles.emptyStateBody}>{errorMessage}</Text>
            ) : null}
            {!isLoading && !errorMessage && canManageChildren ? (
              <Pressable
                accessibilityRole="button"
                onPress={handleAddChildPress}
                style={({ pressed }) => [
                  styles.emptyStateAction,
                  pressed && styles.pressed,
                ]}
              >
                <AppIcon
                  color={styles.emptyStateActionIcon.color}
                  name="plus"
                  size={18}
                />
                <Text style={styles.emptyStateActionLabel}>Add child</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {showSecondaryTopChrome && selectedChild ? (
          <View
            pointerEvents="box-none"
            style={styles.telemetryTopChromeOverlay(0)}
          >
            <Animated.View
              pointerEvents={secondaryTopChromeHidden ? "none" : "auto"}
              style={[
                styles.telemetryTopChromeOffset(
                  topBarHeight + secondaryTopChromeHeight,
                ),
                telemetryStyle,
              ]}
            >
              <View onLayout={handleTelemetryLayout} style={styles.telemetryWrap}>
                <TelemetryBar selectedChild={selectedChild} />
              </View>
            </Animated.View>
          </View>
        ) : null}

        {showHomeBottomChrome && selectedChild && !isWaitingForFirstLocation ? (
          selectedGeofence.status === "editing" ? (
            <GeofenceRadiusEditorCard
              bottomOffset={summaryBottomOffset}
              chromeHidden={secondaryTopChromeHidden}
              key={selectedChild.id}
              liveRadiusMeters={geofenceRadiusDrag.liveRadiusMeters}
              onBackPress={cancelSelectedChildGeofenceEdit}
              onInteractionCancel={geofenceRadiusDrag.cancel}
              onInteractionEnd={geofenceRadiusDrag.onInteractionEnd}
              onInteractionStart={stableGeofenceRadiusInteractionStart}
              onLayout={handleSummaryLayout}
              onSliderValueChange={geofenceRadiusDrag.onSliderValueChange}
              onUnitChange={handleGeofenceRadiusUnitChange}
              radiusMeters={selectedGeofence.radiusMeters}
              radiusUnit={selectedGeofence.radiusUnit}
            />
          ) : (
            <GeofenceStatusCard
              bottomOffset={summaryBottomOffset}
              breachAction={selectedBreachAction}
              childName={selectedChild.name}
              chromeHidden={secondaryTopChromeHidden}
              onActionPress={handleGeofenceStatusActionPress}
              onLayout={handleSummaryLayout}
              radiusMeters={selectedGeofence.savedRadiusMeters}
              radiusUnit={selectedGeofence.radiusUnit}
              status={selectedGeofence.status}
            />
          )
        ) : null}

        {selectedChild && (errorMessage || geofenceError) ? (
          <View
            style={styles.errorBanner(summaryBottomOffset + summaryHeight + 20)}
          >
            <Text style={styles.errorBannerText}>
              {geofenceError ?? errorMessage}
            </Text>
          </View>
        ) : null}
        </BlurTargetView>

        {selectedChild ? (
          <FirstLocationGate
            blurTarget={firstLocationBlurTargetRef}
            childId={selectedChild.id}
            childName={selectedChild.name}
            gsmConnected={selectedChild.connectivity.gsmState === "connected"}
            key={selectedChild.id}
            locationReceived={selectedChild.hasLocationFix}
            onVisibilityChange={setFirstLocationGateVisible}
            protectedTopOffset={topBarHeight + secondaryTopChromeHeight}
            topInset={0}
          />
        ) : null}

        {showPersistentTopBar ? (
          <View pointerEvents="box-none" style={styles.topBarOverlay(0)}>
            <AppTabChrome
              animateThemeIcon={!isTransitioning}
              carouselHidden={secondaryTopChromeHidden}
              carouselStyle={secondaryTopChromeStyle}
              onAddChildPress={handleAddChildPress}
              onCarouselLayout={handleSecondaryTopChromeLayout}
              onChildPress={() => {
                setFollowMode(true);
                lastFollowedCoordinateRef.current = null;
              }}
              onThemeTogglePress={handleThemeToggle}
              onTopBarLayout={handleTopBarLayout}
              secondaryAction={topBarSecondaryAction}
              showCarousel={Boolean(showSecondaryTopChrome && selectedChild)}
              themeName={themeName}
              themeToggleDisabled={isTransitioning}
              topInset={insets.top}
            />
          </View>
        ) : null}

        {HOME_LIVE_SHARING_ENABLED ? (
          <ShareDurationSheet
            activeShare={activeShare}
            childName={selectedChild?.name}
            errorMessage={shareErrorMessage}
            isSubmitting={isCreatingShareLink || isStoppingShareLink}
            mode={shareSheetMode}
            onClose={() => {
              if (isCreatingShareLink || isStoppingShareLink) {
                return;
              }

              setIsShareSheetVisible(false);
              setShareErrorMessage(null);
            }}
            onCreateNew={() => {
              setShareErrorMessage(null);
              setShareSheetMode('replace');
            }}
            onDismiss={() => {
              void openPendingNativeShare();
            }}
            onSelect={handleShareDurationSelect}
            onShareCurrent={handleShareCurrentLink}
            onStopSharing={handleStopSharing}
            visible={isShareSheetVisible}
          />
        ) : null}
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
  blurTarget: {
    flex: 1,
  },
  mapLayer: (topInset: number) => ({
    position: "absolute",
    top: -topInset,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 0,
  }),
  topBarOverlay: (topInset: number) => ({
    position: "absolute",
    top: -topInset,
    left: 0,
    right: 0,
    zIndex: 54,
  }),
  telemetryTopChromeOverlay: (topInset: number) => ({
    position: "absolute",
    top: -topInset,
    left: 0,
    right: 0,
    zIndex: 22,
  }),
  telemetryTopChromeOffset: (topChromeHeight: number) => ({
    paddingTop: topChromeHeight,
  }),
  telemetryWrap: {
    zIndex: 18,
    marginHorizontal: theme.spacing[4],
    marginTop: theme.spacing[3],
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[6],
  },
  emptyStateTitle: {
    color: theme.colors.text,
    textAlign: "center",
    fontFamily: theme.typography.family.display,
    fontSize: theme.typography.size.title,
    fontWeight: theme.typography.weight.semibold,
  },
  emptyStateBody: {
    marginTop: theme.spacing[3],
    color: theme.colors.textSecondary,
    textAlign: "center",
    fontFamily: theme.typography.family.body,
    fontSize: theme.typography.size.body,
    lineHeight: 20,
  },
  emptyStateAction: {
    marginTop: theme.spacing[4],
    minHeight: 42,
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing[4],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
  },
  emptyStateActionIcon: {
    color: theme.colors.primaryGreen,
  },
  emptyStateActionLabel: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: theme.typography.weight.semibold,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
  errorBanner: (bottomOffset: number) => ({
    position: "absolute",
    left: theme.spacing[4],
    right: theme.spacing[4],
    bottom: bottomOffset,
    zIndex: 32,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.alertBorder,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
  }),
  errorBannerText: {
    color: theme.colors.alertText,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: theme.typography.weight.medium,
  },
}));
