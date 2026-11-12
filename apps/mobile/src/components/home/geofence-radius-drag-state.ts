import {
  clampGeofenceRadius,
  type GeofenceRadiusUnit,
} from './geofence-state';

export type GeofenceRadiusDragState = {
  committedRadiusMeters: number;
  interactionActive: boolean;
  liveRadiusMeters: number;
  unit: GeofenceRadiusUnit;
};

export type GeofenceRadiusDragChange = {
  interactionStarted: boolean;
  liveValueChanged: boolean;
  state: GeofenceRadiusDragState;
};

export type GeofenceRadiusDragFinish = {
  commit: GeofenceRadiusCommit | null;
  interactionFinished: boolean;
  state: GeofenceRadiusDragState;
};

export type GeofenceRadiusCommit = {
  fromRadiusMeters: number;
  toRadiusMeters: number;
};

export function createGeofenceRadiusDragState(
  radiusMeters: number,
  unit: GeofenceRadiusUnit,
): GeofenceRadiusDragState {
  const nextRadiusMeters = clampGeofenceRadius(radiusMeters, unit);

  return {
    committedRadiusMeters: nextRadiusMeters,
    interactionActive: false,
    liveRadiusMeters: nextRadiusMeters,
    unit,
  };
}

/** Synchronizes server/React state only while the finger is not in control. */
export function syncGeofenceRadiusDragState(
  state: GeofenceRadiusDragState,
  radiusMeters: number,
  unit: GeofenceRadiusUnit,
) {
  if (state.interactionActive) {
    return state;
  }

  const nextRadiusMeters = clampGeofenceRadius(radiusMeters, unit);

  if (
    state.committedRadiusMeters === nextRadiusMeters
    && state.liveRadiusMeters === nextRadiusMeters
    && state.unit === unit
  ) {
    return state;
  }

  return {
    committedRadiusMeters: nextRadiusMeters,
    interactionActive: false,
    liveRadiusMeters: nextRadiusMeters,
    unit,
  };
}

export function beginGeofenceRadiusDrag(
  state: GeofenceRadiusDragState,
): GeofenceRadiusDragState {
  return state.interactionActive
    ? state
    : { ...state, interactionActive: true };
}

export function changeGeofenceRadiusDrag(
  state: GeofenceRadiusDragState,
  radiusMeters: number,
): GeofenceRadiusDragChange {
  const interactionStarted = !state.interactionActive;
  const nextRadiusMeters = clampGeofenceRadius(radiusMeters, state.unit);
  const liveValueChanged = nextRadiusMeters !== state.liveRadiusMeters;

  if (!interactionStarted && !liveValueChanged) {
    return { interactionStarted, liveValueChanged, state };
  }

  return {
    interactionStarted,
    liveValueChanged,
    state: {
      ...state,
      interactionActive: true,
      liveRadiusMeters: nextRadiusMeters,
    },
  };
}

export function finishGeofenceRadiusDrag(
  state: GeofenceRadiusDragState,
): GeofenceRadiusDragFinish {
  if (!state.interactionActive) {
    return {
      commit: null,
      interactionFinished: false,
      state,
    };
  }

  const commit = state.liveRadiusMeters === state.committedRadiusMeters
    ? null
    : {
        fromRadiusMeters: state.committedRadiusMeters,
        toRadiusMeters: state.liveRadiusMeters,
      };

  return {
    commit,
    interactionFinished: true,
    state: {
      ...state,
      committedRadiusMeters: state.liveRadiusMeters,
      interactionActive: false,
    },
  };
}

export function cancelGeofenceRadiusDrag(
  state: GeofenceRadiusDragState,
): GeofenceRadiusDragState {
  if (
    !state.interactionActive
    && state.liveRadiusMeters === state.committedRadiusMeters
  ) {
    return state;
  }

  return {
    ...state,
    interactionActive: false,
    liveRadiusMeters: state.committedRadiusMeters,
  };
}
