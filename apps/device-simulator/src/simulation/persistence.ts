import {
  DEFAULT_SEND_INTERVAL_SECONDS,
  DEFAULT_SPEED_KMH,
  DEFAULT_STRIDE_LENGTH_METERS,
  LOCAL_STORAGE_KEY,
  type PersistedSimulatorState,
} from "./simulator-state";
import { getPresetById } from "./presets";

const DEFAULT_PRESET = getPresetById("pune-home-school");
const DEFAULT_CELLULAR_PROFILE_ID = "jaipur-lte-serving-cell";
const DEFAULT_CELLULAR_PAYLOAD = JSON.stringify({
  radioType: "lte",
  duplexMode: "fdd",
  towers: [
    {
      role: "serving",
      mobileCountryCode: 404,
      mobileNetworkCode: 70,
      trackingAreaCode: 1660,
      cellId: 232213794,
      physicalCellId: 216,
      band: "LTE BAND 1",
      earfcn: 515,
      rxDbm: -89,
      txDbm: 0,
      rsrpDbm: -97,
      rsrqDb: -5,
      sinrDb: 14,
    },
  ],
}, null, 2);

export function createDefaultPersistedState(): PersistedSimulatorState {
  return {
    activeWorkbenchTab: "simulator",
    apiUrl: import.meta.env.VITE_API_URL ?? "http://api.stepwhere.local",
    cellLookupFastIntervalSeconds: 1,
    cellLookupNormalIntervalSeconds: 7,
    cellularProfiles: [{
      id: DEFAULT_CELLULAR_PROFILE_ID,
      name: "Screenshot LTE cell",
      payloadJson: DEFAULT_CELLULAR_PAYLOAD,
    }],
    enableMetricJitter: true,
    enableCellLookupTimingOverride: true,
    gpsEnabled: true,
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "",
    routeEditorMode: "manual",
    hardwareIdentifier: "SW-DEV-0001",
    ingestApiKey: import.meta.env.VITE_DEVICE_INGEST_API_KEY ?? "",
    initialBatteryPercent: 94,
    initialBatteryVoltageMv: 4145,
    initialSatelliteCount: 12,
    initialSignalStrength: 4,
    initialStepCounter: 0,
    selectedPresetId: DEFAULT_PRESET?.id ?? "pune-home-school",
    selectedCellularProfileId: DEFAULT_CELLULAR_PROFILE_ID,
    sendIntervalSeconds: DEFAULT_SEND_INTERVAL_SECONDS,
    speedKmh: DEFAULT_SPEED_KMH,
    strideLengthMeters: DEFAULT_STRIDE_LENGTH_METERS,
    travelMode: "WALKING",
    themeMode: "light",
    useAutoBatteryVoltage: true,
    waypoints: DEFAULT_PRESET?.waypoints ?? [],
  };
}

export function loadPersistedState() {
  if (typeof window === "undefined") {
    return createDefaultPersistedState();
  }

  const base = createDefaultPersistedState();
  const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);

  if (!raw) {
    return base;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedSimulatorState>;
    const parsedCellularProfiles = Array.isArray(parsed.cellularProfiles)
      && parsed.cellularProfiles.length > 0
      ? parsed.cellularProfiles.filter((profile) => (
        profile
        && typeof profile.id === "string"
        && typeof profile.name === "string"
        && typeof profile.payloadJson === "string"
      ))
      : base.cellularProfiles;
    const cellularProfiles = parsedCellularProfiles.length > 0
      ? parsedCellularProfiles
      : base.cellularProfiles;
    const selectedCellularProfileId = cellularProfiles.some(
      (profile) => profile.id === parsed.selectedCellularProfileId,
    )
      ? parsed.selectedCellularProfileId!
      : cellularProfiles[0]!.id;

    return {
      ...base,
      ...parsed,
      cellularProfiles,
      selectedCellularProfileId,
      waypoints:
        Array.isArray(parsed.waypoints) && parsed.waypoints.length > 0
          ? parsed.waypoints
          : base.waypoints,
    };
  } catch {
    return base;
  }
}

export function persistState(state: PersistedSimulatorState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
}
