import React from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import {
  beginGeofenceRadiusDrag,
  cancelGeofenceRadiusDrag,
  changeGeofenceRadiusDrag,
  createGeofenceRadiusDragState,
  finishGeofenceRadiusDrag,
  syncGeofenceRadiusDragState,
  type GeofenceRadiusCommit,
} from '@/components/home/geofence-radius-drag-state';
import type { GeofenceRadiusUnit } from '@/components/home/geofence-state';

export type GeofenceRadiusDragController = {
  /** Cancel the active gesture without committing its pending value. */
  cancel: () => void;
  /** True while the slider is being dragged. */
  isDragging: boolean;
  /** Live radius shared by the slider, badge, and the single Skia map ring. */
  liveRadiusMeters: SharedValue<number>;
  /** Wire to the platform slider's native completion event. */
  onInteractionEnd: () => void;
  /** Wire to the platform slider's native editing-start event when available. */
  onInteractionStart: () => void;
  /** Wire straight into the slider's `onValueChange`. */
  onSliderValueChange: (value: number) => void;
};

/**
 * Owns the transient state of a geofence radius drag.
 *
 * Native sliders emit `onValueChange` at pointer frequency, not once per step.
 * The drag therefore stays in a ref-backed state machine, updates the small
 * badge/ring through a shared value, and commits exactly once from the
 * platform's real touch-completion event. No native map overlay is rebuilt.
 */
export function useGeofenceRadiusDrag(input: {
  active?: boolean;
  radiusMeters: number;
  unit: GeofenceRadiusUnit;
  onCommit: (commit: GeofenceRadiusCommit) => void;
  onDragStateChange?: (isDragging: boolean) => void;
}): GeofenceRadiusDragController {
  const {
    active = true,
    onCommit,
    onDragStateChange,
    radiusMeters,
    unit,
  } = input;
  const initialState = createGeofenceRadiusDragState(radiusMeters, unit);
  const dragStateRef = React.useRef(initialState);
  const liveRadiusMeters = useSharedValue(initialState.liveRadiusMeters);
  const [isDragging, setIsDragging] = React.useState(false);
  const commitRef = React.useRef(onCommit);
  const dragStateChangeRef = React.useRef(onDragStateChange);

  React.useEffect(() => {
    commitRef.current = onCommit;
    dragStateChangeRef.current = onDragStateChange;
  });

  // Follow committed props while idle. Deactivating the editor cancels any
  // unfinished gesture so the dimmed map state can never get stuck.
  React.useLayoutEffect(() => {
    const current = dragStateRef.current;
    const inactiveState = active ? current : cancelGeofenceRadiusDrag(current);
    const next = syncGeofenceRadiusDragState(inactiveState, radiusMeters, unit);

    dragStateRef.current = next;

    if (next.liveRadiusMeters !== current.liveRadiusMeters) {
      liveRadiusMeters.set(next.liveRadiusMeters);
    }

    if (!next.interactionActive && current.interactionActive) {
      setIsDragging(false);
      dragStateChangeRef.current?.(false);
    }
  }, [active, liveRadiusMeters, radiusMeters, unit]);

  const onInteractionStart = React.useCallback(() => {
    const current = dragStateRef.current;
    const next = beginGeofenceRadiusDrag(current);

    if (next === current) {
      return;
    }

    dragStateRef.current = next;
    setIsDragging(true);
    dragStateChangeRef.current?.(true);
  }, []);

  const onSliderValueChange = React.useCallback((value: number) => {
    const change = changeGeofenceRadiusDrag(dragStateRef.current, value);

    dragStateRef.current = change.state;

    if (change.interactionStarted) {
      setIsDragging(true);
      dragStateChangeRef.current?.(true);
    }

    if (change.liveValueChanged) {
      liveRadiusMeters.set(change.state.liveRadiusMeters);
    }
  }, [liveRadiusMeters]);

  const onInteractionEnd = React.useCallback(() => {
    const finish = finishGeofenceRadiusDrag(dragStateRef.current);

    dragStateRef.current = finish.state;

    if (!finish.interactionFinished) {
      return;
    }

    setIsDragging(false);
    dragStateChangeRef.current?.(false);

    if (finish.commit) {
      commitRef.current(finish.commit);
    }
  }, []);

  const cancel = React.useCallback(() => {
    const current = dragStateRef.current;
    const next = cancelGeofenceRadiusDrag(current);

    if (next === current) {
      return;
    }

    dragStateRef.current = next;
    liveRadiusMeters.set(next.liveRadiusMeters);
    setIsDragging(false);
    dragStateChangeRef.current?.(false);
  }, [liveRadiusMeters]);

  return {
    cancel,
    isDragging,
    liveRadiusMeters,
    onInteractionEnd,
    onInteractionStart,
    onSliderValueChange,
  };
}
