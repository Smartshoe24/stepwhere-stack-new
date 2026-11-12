import { describe, expect, it } from 'vitest';

import {
  beginGeofenceRadiusDrag,
  cancelGeofenceRadiusDrag,
  changeGeofenceRadiusDrag,
  createGeofenceRadiusDragState,
  finishGeofenceRadiusDrag,
  syncGeofenceRadiusDragState,
} from './geofence-radius-drag-state';

describe('geofence radius drag state', () => {
  it('dedupes repeated native events within one snapped step', () => {
    let state = createGeofenceRadiusDragState(1_000, 'km');
    const first = changeGeofenceRadiusDrag(state, 1_230);
    state = first.state;
    const repeated = changeGeofenceRadiusDrag(state, 1_240);

    expect(first.interactionStarted).toBe(true);
    expect(first.liveValueChanged).toBe(false);
    expect(repeated.state).toBe(state);
    expect(repeated.liveValueChanged).toBe(false);
  });

  it('commits one changed value and ignores duplicate completion events', () => {
    let state = createGeofenceRadiusDragState(1_000, 'km');
    state = changeGeofenceRadiusDrag(state, 4_760).state;

    const finish = finishGeofenceRadiusDrag(state);
    const duplicate = finishGeofenceRadiusDrag(finish.state);

    expect(finish.commit).toEqual({
      fromRadiusMeters: 1_000,
      toRadiusMeters: 5_000,
    });
    expect(finish.interactionFinished).toBe(true);
    expect(duplicate.commit).toBeNull();
    expect(duplicate.interactionFinished).toBe(false);
  });

  it('does not commit when the final value is unchanged', () => {
    const state = beginGeofenceRadiusDrag(
      createGeofenceRadiusDragState(500, 'm'),
    );

    expect(finishGeofenceRadiusDrag(state).commit).toBeNull();
  });

  it('cancels back to the committed value without committing', () => {
    let state = createGeofenceRadiusDragState(500, 'm');
    state = changeGeofenceRadiusDrag(state, 900).state;
    state = cancelGeofenceRadiusDrag(state);

    expect(state.interactionActive).toBe(false);
    expect(state.liveRadiusMeters).toBe(500);
    expect(finishGeofenceRadiusDrag(state).commit).toBeNull();
  });

  it('synchronizes unit and radius changes only while idle', () => {
    const initial = createGeofenceRadiusDragState(750, 'm');
    const idleSync = syncGeofenceRadiusDragState(initial, 1_300, 'km');
    const active = beginGeofenceRadiusDrag(initial);
    const activeSync = syncGeofenceRadiusDragState(active, 1_300, 'km');

    expect(idleSync.unit).toBe('km');
    expect(idleSync.liveRadiusMeters).toBe(1_500);
    expect(activeSync).toBe(active);
  });

  it('returns the exact previous and final radii for contraction', () => {
    let state = createGeofenceRadiusDragState(10_000, 'km');
    state = changeGeofenceRadiusDrag(state, 2_600).state;

    expect(finishGeofenceRadiusDrag(state).commit).toEqual({
      fromRadiusMeters: 10_000,
      toRadiusMeters: 2_500,
    });
  });
});
