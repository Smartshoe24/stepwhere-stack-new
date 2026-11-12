export const HISTORY_ALGORITHM_VERSION = 1;

/**
 * Explicit local UI-development switch. The runtime guard in
 * history-fixtures.ts also requires NODE_ENV=development, so this constant can
 * never enable fixtures in a production or test process by itself.
 */
export const ENABLE_DEVELOPMENT_HISTORY_FIXTURES = false;

export const DEFAULT_ACCURACY_METERS = 35;
export const MAX_USABLE_ACCURACY_METERS = 50;

export const STAY_RADIUS_MIN_METERS = 35;
export const STAY_RADIUS_MAX_METERS = 50;
export const MIN_STAY_SAMPLE_COUNT = 3;

export const INITIAL_STAY_DURATION_SECONDS = 5 * 60;
export const NORMAL_STAY_DURATION_SECONDS = 10 * 60;

export const STAY_EXIT_CONFIRMATION_ACTIVE_SAMPLES = 5;
export const TELEMETRY_GAP_SECONDS = 10 * 60;

export const PLACE_EXACT_DISTANCE_METERS = 30;
export const PLACE_NEAR_DISTANCE_METERS = 75;

export const MODE_MIN_DURATION_SECONDS = 60;
export const MODE_MIN_DISTANCE_METERS = 100;
export const WALK_MIN_STEP_RATE_PER_MINUTE = 40;
export const WALK_MAX_MEDIAN_SPEED_KMH = 10;
export const VEHICLE_MIN_MEDIAN_SPEED_KMH = 12;
export const VEHICLE_HIGH_SPEED_KMH = 25;
export const VEHICLE_MAX_STEP_RATE_PER_MINUTE = 40;

export const ISOLATED_SPIKE_SPEED_KMH = 180;
export const PATH_SIMPLIFICATION_TOLERANCE_METERS = 4;
export const MAX_STORED_PATH_POINTS = 500;

export const GOOGLE_CONTENT_CACHE_DAYS = 30;
export const ROAD_GEOMETRY_CACHE_DAYS = 30;

// TODO(history-retention): MVP retains raw location_events and derived history
// indefinitely. Before production scale, archive old raw telemetry to cold storage
// and implement a verified purge/rebuild policy.
