import { useEffect, useMemo, useRef, useState } from "react";
import type { ChildSummaryDto, LocationTelemetryInput } from "@stepwhere/types";

import { sendTelemetry, SimulatorApiError } from "./api/telemetry-client";
import { ControlPanel } from "./components/ControlPanel";
import { GoogleWaypointMap } from "./components/GoogleWaypointMap";
import { MetricsPanel } from "./components/MetricsPanel";
import { PayloadPreview } from "./components/PayloadPreview";
import { RoutePanel } from "./components/RoutePanel";
import { SimulatorLog } from "./components/SimulatorLog";
import { StatusControls } from "./components/StatusControls";
import { WorkbenchTabs } from "./components/WorkbenchTabs";
import { loadRoutesLibrary } from "./google/google-maps-loader";
import { formatDistance, haversineDistanceMeters } from "./simulation/distance";
import { applyBatteryDrain, applySatelliteJitter, applySignalJitter, deriveBatteryVoltageMv, getStepDeltaFromDistance } from "./simulation/metrics";
import { createDefaultPersistedState, loadPersistedState, persistState } from "./simulation/persistence";
import { getPresetById } from "./simulation/presets";
import {
  buildTelemetryPayload,
  getSimulationTimingError,
  parseCellularTelemetryJson,
} from "./simulation/telemetry-payload";
import {
  getCurrentWaypointPosition,
  getJourneyProgress,
  getPreparedRoutePath,
  getTravelDistanceForElapsed,
} from "./simulation/journey";
import type {
  DeviceState,
  GeneratedSimulatorRoute,
  LogEntry,
  PersistedSimulatorState,
  RuntimeMetrics,
  SimulatorPlace,
  SimulatorRunState,
  Waypoint,
} from "./simulation/simulator-state";

function createWaypoint(latitude: number, longitude: number): Waypoint {
  return {
    id: `waypoint-${Math.random().toString(36).slice(2, 10)}`,
    latitude,
    longitude,
  };
}

function getStateLabel(runState: SimulatorRunState) {
  switch (runState) {
    case "sleep":
      return "Sleep";
    case "offline":
      return "Offline";
    case "running":
      return "Running";
    case "paused":
      return "Paused";
    case "stopped":
      return "Stopped";
    case "completed":
      return "Completed";
    default:
      return "Idle";
  }
}

function getPayloadDeviceState(runState: SimulatorRunState): DeviceState {
  if (runState === "sleep") {
    return "sleep";
  }

  if (runState === "offline") {
    return "offline";
  }

  return "active";
}

function createRuntimeMetrics(settings: PersistedSimulatorState): RuntimeMetrics {
  return {
    batteryPercent: settings.initialBatteryPercent,
    batteryVoltageMv: settings.useAutoBatteryVoltage
      ? deriveBatteryVoltageMv(settings.initialBatteryPercent)
      : settings.initialBatteryVoltageMv,
    deviceState: "active",
    distanceTraveledMeters: 0,
    lastResponseStatus: null,
    lastSentAt: null,
    lastStepDelta: 0,
    samplesSent: 0,
    satelliteCount: settings.initialSatelliteCount,
    signalStrength: settings.initialSignalStrength,
    stepCounter: settings.initialStepCounter,
  };
}

function appendLog(current: LogEntry[], entry: LogEntry) {
  return [entry, ...current].slice(0, 100);
}

function formatDurationSeconds(durationSeconds: number | null) {
  if (durationSeconds == null) {
    return null;
  }

  if (durationSeconds >= 3600) {
    const hours = Math.floor(durationSeconds / 3600);
    const minutes = Math.round((durationSeconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }

  return `${Math.max(1, Math.round(durationSeconds / 60))} min`;
}

function dedupeGeneratedRoutePoints(points: Waypoint[]) {
  return points.filter((point, index) => {
    const previous = points[index - 1];
    return !previous || haversineDistanceMeters(previous, point) > 1;
  });
}

function isValidGeneratedRoutePoint(point: { latitude: number; longitude: number }) {
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
}

export function App() {
  const initialSettings = useRef(loadPersistedState()).current;
  const [settings, setSettings] = useState<PersistedSimulatorState>(initialSettings);
  const [runState, setRunState] = useState<SimulatorRunState>("idle");
  const [revealApiKey, setRevealApiKey] = useState(false);
  const [revealGoogleMapsApiKey, setRevealGoogleMapsApiKey] = useState(false);
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(
    initialSettings.waypoints[0]?.id ?? null,
  );
  const [metrics, setMetrics] = useState<RuntimeMetrics>(() => createRuntimeMetrics(initialSettings));
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [lastChildSummary, setLastChildSummary] = useState<ChildSummaryDto | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [googleMapsKeyChanged, setGoogleMapsKeyChanged] = useState(false);
  const [originPlace, setOriginPlace] = useState<SimulatorPlace | null>(null);
  const [destinationPlace, setDestinationPlace] = useState<SimulatorPlace | null>(null);
  const [generatedRoute, setGeneratedRoute] = useState<GeneratedSimulatorRoute | null>(null);
  const [isBuildingRoute, setIsBuildingRoute] = useState(false);
  const [routeBuildError, setRouteBuildError] = useState<string | null>(null);
  const [mapViewportBias, setMapViewportBias] = useState<google.maps.LatLngBoundsLiteral | null>(null);

  const settingsRef = useRef(settings);
  const runStateRef = useRef(runState);
  const metricsRef = useRef(metrics);
  const activeRoutePointsRef = useRef<Waypoint[]>(settings.waypoints);
  const preparedRoutePathRef = useRef(getPreparedRoutePath(settings.waypoints));
  const lastTickRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  settingsRef.current = settings;
  runStateRef.current = runState;
  metricsRef.current = metrics;

  const activeRoutePoints = settings.routeEditorMode === "places"
    ? generatedRoute?.points ?? []
    : settings.waypoints;
  const preparedRoutePath = useMemo(() => getPreparedRoutePath(activeRoutePoints), [activeRoutePoints]);
  const totalDistanceMeters = preparedRoutePath.totalDistanceMeters;
  const currentPosition = getCurrentWaypointPosition(preparedRoutePath, metrics.distanceTraveledMeters);
  const progressPercent = getJourneyProgress(metrics.distanceTraveledMeters, totalDistanceMeters);
  const selectedCellularProfile = settings.cellularProfiles.find(
    (profile) => profile.id === settings.selectedCellularProfileId,
  ) ?? settings.cellularProfiles[0];
  const cellularParseResult = useMemo(
    () => parseCellularTelemetryJson(selectedCellularProfile?.payloadJson ?? ""),
    [selectedCellularProfile?.payloadJson],
  );
  const simulationTimingError = getSimulationTimingError(settings);
  const payloadConfigurationError = cellularParseResult.error ?? simulationTimingError;
  const nextPayload = cellularParseResult.data && !simulationTimingError
    ? buildTelemetryPayload({
      currentPosition,
      deviceState: getPayloadDeviceState(runState),
      runtimeBatteryPercent: metrics.batteryPercent,
      runtimeBatteryVoltageMv: metrics.batteryVoltageMv,
      runtimeSatelliteCount: metrics.satelliteCount,
      runtimeSignalStrength: metrics.signalStrength,
      runtimeStepCounter: metrics.stepCounter,
      settings,
      cellular: cellularParseResult.data,
    })
    : null;
  const stateLabel = getStateLabel(runState);
  const isRouteLocked = runState === "running" || runState === "sleep";
  const generatedRouteDistanceLabel = generatedRoute ? formatDistance(generatedRoute.distanceMeters) : null;
  const generatedRouteDurationLabel = formatDurationSeconds(generatedRoute?.durationSeconds ?? null);

  activeRoutePointsRef.current = activeRoutePoints;
  preparedRoutePathRef.current = preparedRoutePath;

  useEffect(() => {
    persistState(settings);
  }, [settings]);

  useEffect(() => {
    if (runState === "idle") {
      setMetrics(createRuntimeMetrics(settings));
    }
  }, [
    runState,
    settings.enableMetricJitter,
    settings.initialBatteryPercent,
    settings.initialBatteryVoltageMv,
    settings.initialSatelliteCount,
    settings.initialSignalStrength,
    settings.initialStepCounter,
    settings.useAutoBatteryVoltage,
  ]);

  useEffect(() => {
    const selectedStillExists = settings.waypoints.some((waypoint) => waypoint.id === selectedWaypointId);
    if ((!selectedWaypointId || !selectedStillExists) && settings.waypoints[0]) {
      setSelectedWaypointId(settings.waypoints[0].id);
    }
  }, [selectedWaypointId, settings.waypoints]);

  useEffect(() => {
    if (runState !== "running" && runState !== "sleep") {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      lastTickRef.current = null;
      return;
    }

    const tick = () => {
      void emitTelemetrySample({
        allowMovement: runStateRef.current === "running",
        overrideState: runStateRef.current === "sleep" ? "sleep" : undefined,
      });
    };

    intervalRef.current = setInterval(tick, Math.max(1, settings.sendIntervalSeconds) * 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [runState, settings.sendIntervalSeconds]);

  async function emitTelemetrySample(input?: {
    allowMovement?: boolean;
    overrideState?: DeviceState;
  }) {
    const nextSettings = settingsRef.current;
    const nextMetrics = metricsRef.current;
    const totalDistance = preparedRoutePathRef.current.totalDistanceMeters;
    const currentRunState = runStateRef.current;
    const now = Date.now();
    const elapsedSeconds = lastTickRef.current ? (now - lastTickRef.current) / 1000 : nextSettings.sendIntervalSeconds;
    lastTickRef.current = now;

    const shouldMove = input?.allowMovement ?? currentRunState === "running";
    const nextDistance = shouldMove
      ? getTravelDistanceForElapsed({
        currentDistanceMeters: nextMetrics.distanceTraveledMeters,
        elapsedSeconds,
        speedKmh: nextSettings.speedKmh,
        totalDistanceMeters: totalDistance,
      })
      : nextMetrics.distanceTraveledMeters;
    const distanceAdvanced = Math.max(0, nextDistance - nextMetrics.distanceTraveledMeters);
    const stepDelta = shouldMove
      ? getStepDeltaFromDistance(distanceAdvanced, nextSettings.strideLengthMeters)
      : 0;

    const drainedBatteryPercent = applyBatteryDrain({
      batteryPercent: nextMetrics.batteryPercent,
      elapsedSeconds: currentRunState === "sleep" ? elapsedSeconds * 0.35 : elapsedSeconds,
    });

    const nextStepCounter = drainedBatteryPercent <= 0 ? 0 : nextMetrics.stepCounter + stepDelta;
    const nextSignalStrength = nextSettings.enableMetricJitter
      ? applySignalJitter(nextMetrics.signalStrength)
      : nextMetrics.signalStrength;
    const nextSatelliteCount = nextSettings.enableMetricJitter
      ? applySatelliteJitter(nextMetrics.satelliteCount)
      : nextMetrics.satelliteCount;
    const nextVoltage = nextSettings.useAutoBatteryVoltage
      ? deriveBatteryVoltageMv(drainedBatteryPercent)
      : nextMetrics.batteryVoltageMv;
    const deviceState = input?.overrideState ?? getPayloadDeviceState(currentRunState);
    const nextPosition = getCurrentWaypointPosition(preparedRoutePathRef.current, nextDistance);
    const selectedProfile = nextSettings.cellularProfiles.find(
      (profile) => profile.id === nextSettings.selectedCellularProfileId,
    ) ?? nextSettings.cellularProfiles[0];
    const cellularResult = parseCellularTelemetryJson(selectedProfile?.payloadJson ?? "");
    const timingError = getSimulationTimingError(nextSettings);

    if (!cellularResult.data || timingError) {
      const message = cellularResult.error ?? timingError!;
      setLastError(message);
      setLogs((current) => appendLog(current, {
        id: `${Date.now()}-invalid-payload`,
        message,
        payloadSummary: "Telemetry configuration is invalid",
        responseStatus: null,
        state: currentRunState,
        timestamp: new Date().toISOString(),
      }));
      return;
    }

    const payload = buildTelemetryPayload({
      currentPosition: nextPosition,
      deviceState,
      runtimeBatteryPercent: drainedBatteryPercent,
      runtimeBatteryVoltageMv: nextVoltage,
      runtimeSatelliteCount: nextSatelliteCount,
      runtimeSignalStrength: nextSignalStrength,
      runtimeStepCounter: nextStepCounter,
      settings: nextSettings,
      cellular: cellularResult.data,
    });

    if (!payload) {
      setLastError("Create a route before sending telemetry.");
      setLogs((current) => appendLog(current, {
        id: `${Date.now()}-no-route`,
        message: "No route is available for telemetry.",
        payloadSummary: "Route is empty",
        responseStatus: null,
        state: currentRunState,
        timestamp: new Date().toISOString(),
      }));
      return;
    }

    const nextRuntimeMetrics = {
      ...nextMetrics,
      batteryPercent: drainedBatteryPercent,
      batteryVoltageMv: nextVoltage,
      deviceState,
      distanceTraveledMeters: nextDistance,
      lastStepDelta: stepDelta,
      satelliteCount: nextSatelliteCount,
      signalStrength: nextSignalStrength,
      stepCounter: nextStepCounter,
    };

    metricsRef.current = nextRuntimeMetrics;
    setMetrics(nextRuntimeMetrics);

    if (shouldMove && nextDistance >= totalDistance && totalDistance > 0) {
      setRunState("completed");
    }

    const payloadSummary = `${payload.hardwareIdentifier} @ ${payload.latitude.toFixed(4)}, ${payload.longitude.toFixed(4)} steps=${payload.stepCounter}`;

    try {
      const child = await sendTelemetry({
        apiUrl: nextSettings.apiUrl,
        ingestKey: nextSettings.ingestApiKey,
        payload,
      });

      setLastChildSummary(child);
      setLastError(null);
      setMetrics((current) => ({
        ...current,
        lastResponseStatus: 201,
        lastSentAt: new Date().toISOString(),
        samplesSent: current.samplesSent + 1,
      }));
      setLogs((current) => appendLog(current, {
        id: `${Date.now()}-success`,
        message: `Telemetry accepted for ${child.name}.`,
        payloadSummary,
        responseStatus: 201,
        state: currentRunState,
        timestamp: new Date().toISOString(),
      }));
    } catch (error) {
      const status = error instanceof SimulatorApiError ? error.status : null;
      const message = error instanceof Error ? error.message : "Telemetry send failed.";
      setLastError(message);
      setMetrics((current) => ({
        ...current,
        lastResponseStatus: status,
        lastSentAt: new Date().toISOString(),
        samplesSent: current.samplesSent + 1,
      }));
      setLogs((current) => appendLog(current, {
        id: `${Date.now()}-error`,
        message,
        payloadSummary,
        responseStatus: status,
        state: currentRunState,
        timestamp: new Date().toISOString(),
      }));
    }
  }

  function resetRuntimeMetrics() {
    const nextMetrics = createRuntimeMetrics(settingsRef.current);
    metricsRef.current = nextMetrics;
    setMetrics(nextMetrics);
    setLastChildSummary(null);
    setLastError(null);
  }

  function resetJourneyState() {
    runStateRef.current = "idle";
    setRunState("idle");
    resetRuntimeMetrics();
    lastTickRef.current = null;
  }

  function updateSetting<K extends keyof PersistedSimulatorState>(key: K, value: PersistedSimulatorState[K]) {
    if (key === "googleMapsApiKey") {
      setGoogleMapsKeyChanged(true);
    }
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function handleSelectCellularProfile(profileId: string) {
    setSettings((current) => ({
      ...current,
      selectedCellularProfileId: profileId,
    }));
  }

  function handleCellularProfileChange(key: "name" | "payloadJson", value: string) {
    setSettings((current) => ({
      ...current,
      cellularProfiles: current.cellularProfiles.map((profile) => (
        profile.id === current.selectedCellularProfileId
          ? { ...profile, [key]: value }
          : profile
      )),
    }));
  }

  function handleAddCellularProfile() {
    const source = settings.cellularProfiles.find(
      (profile) => profile.id === settings.selectedCellularProfileId,
    ) ?? settings.cellularProfiles[0];
    const profileId = `cell-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    setSettings((current) => ({
      ...current,
      cellularProfiles: [
        ...current.cellularProfiles,
        {
          id: profileId,
          name: `Cell profile ${current.cellularProfiles.length + 1}`,
          payloadJson: source?.payloadJson ?? "",
        },
      ],
      selectedCellularProfileId: profileId,
    }));
  }

  function handleDeleteCellularProfile() {
    if (settings.cellularProfiles.length <= 1) {
      return;
    }

    setSettings((current) => {
      const cellularProfiles = current.cellularProfiles.filter(
        (profile) => profile.id !== current.selectedCellularProfileId,
      );

      return {
        ...current,
        cellularProfiles,
        selectedCellularProfileId: cellularProfiles[0]!.id,
      };
    });
  }

  function toggleThemeMode() {
    updateSetting("themeMode", settings.themeMode === "dark" ? "light" : "dark");
  }

  function handlePresetChange(presetId: string) {
    const preset = getPresetById(presetId);
    if (!preset) {
      return;
    }

    setSettings((current) => ({
      ...current,
      selectedPresetId: preset.id,
      waypoints: preset.waypoints.map((waypoint) => ({ ...waypoint })),
    }));
    setSelectedWaypointId(preset.waypoints[0]?.id ?? null);
    resetJourneyState();
  }

  function handleWaypointUpdate(waypointId: string, key: "latitude" | "longitude", value: number) {
    setSettings((current) => ({
      ...current,
      waypoints: current.waypoints.map((waypoint) => (
        waypoint.id === waypointId
          ? { ...waypoint, [key]: value }
          : waypoint
      )),
    }));
  }

  function handleWaypointRemove(waypointId: string) {
    setSettings((current) => ({
      ...current,
      waypoints: current.waypoints.filter((waypoint) => waypoint.id !== waypointId),
    }));

    if (selectedWaypointId === waypointId) {
      setSelectedWaypointId(null);
    }
  }

  function handleWaypointAdd(latitude: number, longitude: number) {
    if (settings.routeEditorMode !== "manual" || isRouteLocked) {
      return;
    }

    const waypoint = createWaypoint(latitude, longitude);
    setSettings((current) => ({
      ...current,
      selectedPresetId: "custom",
      waypoints: [...current.waypoints, waypoint],
    }));
    setSelectedWaypointId(waypoint.id);
  }

  function handleReverseRoute() {
    setSettings((current) => ({
      ...current,
      selectedPresetId: "custom",
      waypoints: [...current.waypoints].reverse(),
    }));
    resetJourneyState();
  }

  function handleClearRoute() {
    setSettings((current) => ({
      ...current,
      selectedPresetId: "custom",
      waypoints: [],
    }));
    resetJourneyState();
  }

  function handleStartJourney() {
    if (activeRoutePointsRef.current.length === 0) {
      setLastError("Create a route before starting the journey.");
      return;
    }
    resetRuntimeMetrics();
    runStateRef.current = "running";
    setRunState("running");
    lastTickRef.current = null;
    void emitTelemetrySample({ allowMovement: false, overrideState: "active" });
  }

  function handlePause() {
    runStateRef.current = "paused";
    setRunState("paused");
  }

  function handleResume() {
    runStateRef.current = "running";
    setRunState("running");
    lastTickRef.current = null;
    void emitTelemetrySample({ allowMovement: false, overrideState: "active" });
  }

  function handleStopJourney() {
    runStateRef.current = "stopped";
    setRunState("stopped");
  }

  function handleResetJourney() {
    resetJourneyState();
  }

  function handleSendOneSample() {
    void emitTelemetrySample({ allowMovement: false });
  }

  function handleSendSleep() {
    runStateRef.current = "sleep";
    setRunState("sleep");
    lastTickRef.current = null;
    void emitTelemetrySample({ allowMovement: false, overrideState: "sleep" });
  }

  function handleSendExplicitOffline() {
    runStateRef.current = "offline";
    setRunState("offline");
    lastTickRef.current = null;
    void emitTelemetrySample({ allowMovement: false, overrideState: "offline" });
  }

  function handleStopSending() {
    runStateRef.current = "stopped";
    setRunState("stopped");
  }

  function handleSetActive() {
    runStateRef.current = "running";
    setRunState("running");
    lastTickRef.current = null;
    void emitTelemetrySample({ allowMovement: false, overrideState: "active" });
  }

  function handleResetStepCounter() {
    const nextMetrics = {
      ...metricsRef.current,
      lastStepDelta: 0,
      stepCounter: 0,
    };
    metricsRef.current = nextMetrics;
    setMetrics(nextMetrics);
  }

  function handleRestoreDefaults() {
    const defaults = createDefaultPersistedState();
    setSettings(defaults);
    setSelectedWaypointId(defaults.waypoints[0]?.id ?? null);
    setGoogleMapsKeyChanged(false);
    setOriginPlace(null);
    setDestinationPlace(null);
    setGeneratedRoute(null);
    setRouteBuildError(null);
    resetJourneyState();
  }

  function handleRouteEditorModeChange(mode: PersistedSimulatorState["routeEditorMode"]) {
    if (settings.routeEditorMode === mode) {
      return;
    }

    updateSetting("routeEditorMode", mode);
    resetJourneyState();
  }

  function clearGeneratedRouteState() {
    setGeneratedRoute(null);
    setRouteBuildError(null);
  }

  function handleOriginPlaceChange(place: SimulatorPlace | null) {
    setOriginPlace(place);
    clearGeneratedRouteState();
  }

  function handleDestinationPlaceChange(place: SimulatorPlace | null) {
    setDestinationPlace(place);
    clearGeneratedRouteState();
  }

  function handleTravelModeChange(travelMode: PersistedSimulatorState["travelMode"]) {
    updateSetting("travelMode", travelMode);
    clearGeneratedRouteState();
  }

  function handleSwapPlaces() {
    setOriginPlace(destinationPlace);
    setDestinationPlace(originPlace);
    clearGeneratedRouteState();
  }

  function handleClearGeneratedRoute() {
    setOriginPlace(null);
    setDestinationPlace(null);
    clearGeneratedRouteState();
    resetJourneyState();
  }

  async function handleBuildGeneratedRoute() {
    if (!originPlace || !destinationPlace) {
      setRouteBuildError("Select both an origin and a destination.");
      return;
    }

    if (!settings.googleMapsApiKey.trim()) {
      setRouteBuildError("A Google Maps browser key is required to build routes.");
      return;
    }

    setIsBuildingRoute(true);
    setRouteBuildError(null);

    try {
      const { Route } = await loadRoutesLibrary(settings.googleMapsApiKey);
      const result = await Route.computeRoutes({
        origin: { lat: originPlace.latitude, lng: originPlace.longitude },
        destination: { lat: destinationPlace.latitude, lng: destinationPlace.longitude },
        travelMode: settings.travelMode,
        computeAlternativeRoutes: false,
        fields: ["path", "distanceMeters", "durationMillis", "viewport"],
      });
      const route = result.routes?.[0];

      if (!route?.path || route.path.length < 2) {
        setRouteBuildError("Google did not return a route for those places.");
        return;
      }

      const points = dedupeGeneratedRoutePoints(route.path.map((point, index) => ({
        id: `route-${index}`,
        latitude: point.lat,
        longitude: point.lng,
      })).filter(isValidGeneratedRoutePoint));

      if (points.length < 2) {
        setRouteBuildError("Google returned invalid route geometry.");
        return;
      }

      const fallbackDistanceMeters = getPreparedRoutePath(points).totalDistanceMeters;
      const durationMillis = route.durationMillis == null ? null : Number(route.durationMillis);
      const nextGeneratedRoute = {
        points,
        distanceMeters: route.distanceMeters ?? fallbackDistanceMeters,
        durationSeconds: durationMillis != null && Number.isFinite(durationMillis)
          ? Math.round(durationMillis / 1000)
          : null,
      } satisfies GeneratedSimulatorRoute;

      setGeneratedRoute(nextGeneratedRoute);
      setLogs((current) => appendLog(current, {
        id: `${Date.now()}-route-built`,
        message: `Built ${settings.travelMode.toLowerCase()} route from ${originPlace.label} to ${destinationPlace.label}.`,
        payloadSummary: `${points.length} points · ${formatDistance(nextGeneratedRoute.distanceMeters)}`,
        responseStatus: null,
        state: runStateRef.current,
        timestamp: new Date().toISOString(),
      }));
      setRouteBuildError(null);
      resetJourneyState();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to build the Google route.";
      setRouteBuildError(message);
      setLogs((current) => appendLog(current, {
        id: `${Date.now()}-route-error`,
        message,
        payloadSummary: `${originPlace.label} -> ${destinationPlace.label}`,
        responseStatus: null,
        state: runStateRef.current,
        timestamp: new Date().toISOString(),
      }));
    } finally {
      setIsBuildingRoute(false);
    }
  }

  if (import.meta.env.PROD && import.meta.env.VITE_ENABLE_SIMULATOR !== "true") {
    return (
      <main className="blocked-screen">
        <h1>Simulator blocked</h1>
        <p>This app is intended for local development only. Set `VITE_ENABLE_SIMULATOR=true` to allow production builds.</p>
      </main>
    );
  }

  return (
    <main className={`app-shell app-shell--${settings.themeMode}`}>
      <header className="app-header">
        <div className="app-title-group">
          <p className="eyebrow">Internal tool</p>
          <h1>Device Simulator</h1>
        </div>
        <div className="header-actions">
          <div className="target-chip">
            <span>Telemetry target</span>
            <strong title={settings.apiUrl}>{settings.apiUrl}</strong>
          </div>
          <button className="button button--outline theme-toggle" onClick={toggleThemeMode} type="button">
            {settings.themeMode === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <div className={`state-badge state-badge--${runState}`}>
            <span>{stateLabel}</span>
          </div>
        </div>
      </header>

      {lastError ? <div className="alert-banner">{lastError}</div> : null}

      <div className="workspace">
        <section className="workspace__sidebar">
          <WorkbenchTabs
            activeTab={settings.activeWorkbenchTab}
            onTabChange={(tab) => updateSetting("activeWorkbenchTab", tab)}
          />

          {settings.activeWorkbenchTab === "simulator" ? (
            <ControlPanel
              cellularProfileError={cellularParseResult.error}
              googleMapsKeyChanged={googleMapsKeyChanged}
              onAddCellularProfile={handleAddCellularProfile}
              onCellularProfileChange={handleCellularProfileChange}
              onDeleteCellularProfile={handleDeleteCellularProfile}
              onFieldChange={updateSetting}
              onPause={handlePause}
              onResetJourney={handleResetJourney}
              onResetSettings={handleRestoreDefaults}
              onResetStepCounter={handleResetStepCounter}
              onResume={handleResume}
              onSendOneSample={handleSendOneSample}
              onSelectCellularProfile={handleSelectCellularProfile}
              onStartJourney={handleStartJourney}
              onStopJourney={handleStopJourney}
              revealApiKey={revealApiKey}
              revealGoogleMapsApiKey={revealGoogleMapsApiKey}
              runState={runState}
              simulationTimingError={simulationTimingError}
              setRevealApiKey={setRevealApiKey}
              setRevealGoogleMapsApiKey={setRevealGoogleMapsApiKey}
              settings={settings}
            />
          ) : (
            <RoutePanel
              destinationPlace={destinationPlace}
              generatedRouteDistanceLabel={generatedRouteDistanceLabel}
              generatedRouteDurationLabel={generatedRouteDurationLabel}
              googleMapsApiKey={settings.googleMapsApiKey}
              isBuildingRoute={isBuildingRoute}
              isRouteLocked={isRouteLocked}
              onBuildGeneratedRoute={handleBuildGeneratedRoute}
              onClearGeneratedRoute={handleClearGeneratedRoute}
              onClearRoute={handleClearRoute}
              onDestinationPlaceChange={handleDestinationPlaceChange}
              onOriginPlaceChange={handleOriginPlaceChange}
              onPresetChange={handlePresetChange}
              onReverseRoute={handleReverseRoute}
              onRouteEditorModeChange={handleRouteEditorModeChange}
              onSwapPlaces={handleSwapPlaces}
              onTravelModeChange={handleTravelModeChange}
              onWaypointRemove={handleWaypointRemove}
              onWaypointSelect={setSelectedWaypointId}
              onWaypointUpdate={handleWaypointUpdate}
              originPlace={originPlace}
              routeBuildError={routeBuildError}
              routeEditorMode={settings.routeEditorMode}
              selectedPresetId={settings.selectedPresetId}
              selectedWaypointId={selectedWaypointId}
              totalDistanceLabel={formatDistance(totalDistanceMeters)}
              travelMode={settings.travelMode}
              viewportBias={mapViewportBias}
              waypoints={settings.waypoints}
            />
          )}
        </section>

        <section className="workspace__content">
          <GoogleWaypointMap
            apiKey={settings.googleMapsApiKey}
            currentPosition={currentPosition}
            destinationPlace={destinationPlace}
            generatedRoutePoints={generatedRoute?.points ?? []}
            isRouteLocked={isRouteLocked}
            onViewportBiasChange={setMapViewportBias}
            onWaypointAdd={handleWaypointAdd}
            onWaypointSelect={setSelectedWaypointId}
            onWaypointUpdate={(waypointId, latitude, longitude) => {
              handleWaypointUpdate(waypointId, "latitude", latitude);
              handleWaypointUpdate(waypointId, "longitude", longitude);
            }}
            originPlace={originPlace}
            routeEditorMode={settings.routeEditorMode}
            selectedWaypointId={selectedWaypointId}
            themeMode={settings.themeMode}
            waypoints={settings.waypoints}
          />

          <div className="below-map-grid">
            <MetricsPanel
              batteryPercent={metrics.batteryPercent}
              batteryVoltageMv={metrics.batteryVoltageMv}
              currentLatitude={currentPosition?.latitude ?? null}
              currentLongitude={currentPosition?.longitude ?? null}
              currentSpeedKmh={runState === "running" ? settings.speedKmh : 0}
              distanceLabel={formatDistance(metrics.distanceTraveledMeters)}
              lastResponseStatus={metrics.lastResponseStatus}
              lastSentAt={metrics.lastSentAt}
              lastStepDelta={metrics.lastStepDelta}
              progressPercent={progressPercent}
              samplesSent={metrics.samplesSent}
              gpsEnabled={settings.gpsEnabled}
              cellularProfileName={selectedCellularProfile?.name ?? "None"}
              satelliteCount={metrics.satelliteCount}
              signalStrength={metrics.signalStrength}
              stepCounter={metrics.stepCounter}
              totalDistanceLabel={formatDistance(totalDistanceMeters)}
            />

            <StatusControls
              currentStateLabel={stateLabel}
              onSendExplicitOffline={handleSendExplicitOffline}
              onSendSleep={handleSendSleep}
              onSetActive={handleSetActive}
              onStopSending={handleStopSending}
              runState={runState}
            />
          </div>

          <div className="details-grid">
            <PayloadPreview
              error={payloadConfigurationError}
              payload={nextPayload as LocationTelemetryInput | null}
            />
            <SimulatorLog logs={logs} />
          </div>
        </section>
      </div>

      {lastChildSummary ? (
        <footer className="app-footer">
          <span>Last child update: {lastChildSummary.name}</span>
          <span>Status: {lastChildSummary.statusLabel ?? lastChildSummary.status}</span>
          <span>Steps this hour: {lastChildSummary.stepsThisHour}</span>
        </footer>
      ) : null}
    </main>
  );
}
