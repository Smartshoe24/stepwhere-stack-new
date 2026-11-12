export type DeviceState = "active" | "sleep" | "offline";

export type SimulatorRunState =
  | "idle"
  | "running"
  | "paused"
  | "sleep"
  | "offline"
  | "stopped"
  | "completed";

export type Waypoint = {
  id: string;
  latitude: number;
  longitude: number;
};

export type RouteEditorMode = "manual" | "places";
export type SimulatorTravelMode = "WALKING" | "DRIVING";

export type SimulatorPlace = {
  placeId: string;
  label: string;
  address: string | null;
  latitude: number;
  longitude: number;
};

export type GeneratedSimulatorRoute = {
  points: Waypoint[];
  distanceMeters: number;
  durationSeconds: number | null;
};

export type RoutePreset = {
  id: string;
  label: string;
  waypoints: Waypoint[];
};

export type CellularProfile = {
  id: string;
  name: string;
  payloadJson: string;
};

export type PersistedSimulatorState = {
  activeWorkbenchTab: "simulator" | "route";
  apiUrl: string;
  cellLookupFastIntervalSeconds: number;
  cellLookupNormalIntervalSeconds: number;
  cellularProfiles: CellularProfile[];
  enableMetricJitter: boolean;
  enableCellLookupTimingOverride: boolean;
  gpsEnabled: boolean;
  googleMapsApiKey: string;
  routeEditorMode: RouteEditorMode;
  hardwareIdentifier: string;
  ingestApiKey: string;
  initialBatteryPercent: number;
  initialBatteryVoltageMv: number;
  initialSatelliteCount: number;
  initialSignalStrength: number;
  initialStepCounter: number;
  selectedPresetId: string;
  selectedCellularProfileId: string;
  sendIntervalSeconds: number;
  speedKmh: number;
  strideLengthMeters: number;
  travelMode: SimulatorTravelMode;
  themeMode: "light" | "dark";
  useAutoBatteryVoltage: boolean;
  waypoints: Waypoint[];
};

export type RuntimeMetrics = {
  batteryPercent: number;
  batteryVoltageMv: number;
  deviceState: DeviceState;
  distanceTraveledMeters: number;
  lastResponseStatus: number | null;
  lastSentAt: string | null;
  lastStepDelta: number;
  samplesSent: number;
  satelliteCount: number;
  signalStrength: number;
  stepCounter: number;
};

export type LogEntry = {
  id: string;
  message: string;
  payloadSummary: string;
  responseStatus: number | null;
  state: SimulatorRunState;
  timestamp: string;
};

export const DEFAULT_SEND_INTERVAL_SECONDS = 8;
export const DEFAULT_SPEED_KMH = 18;
export const DEFAULT_STRIDE_LENGTH_METERS = 0.7;
export const DEFAULT_BATTERY_DRAIN_PER_MINUTE = 0.2;
export const LOCAL_STORAGE_KEY = "stepwhere.device-simulator.state.v1";
