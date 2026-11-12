import { Slider } from '@expo/ui/community/slider';
import React from 'react';

import type { GeofenceRadiusSliderProps } from './geofence-radius-slider.types';

const WEB_RELEASE_SETTLE_MS = 140;

/** Web fallback; native platforms use their real slider completion events. */
function GeofenceRadiusSliderComponent({
  activeTrackColor,
  inactiveTrackColor,
  liveValue,
  maximumValue,
  minimumValue,
  onInteractionCancel: _onInteractionCancel,
  onInteractionEnd,
  onInteractionStart,
  onValueChange,
  step,
  style,
  thumbColor,
  value,
}: GeofenceRadiusSliderProps) {
  const releaseTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionActiveRef = React.useRef(false);

  React.useEffect(() => () => {
    if (releaseTimeoutRef.current) {
      clearTimeout(releaseTimeoutRef.current);
    }
  }, []);

  const handleValueChange = React.useCallback((nextValue: number) => {
    if (!interactionActiveRef.current) {
      interactionActiveRef.current = true;
      onInteractionStart();
    }

    liveValue.set(nextValue);
    onValueChange(nextValue);

    if (releaseTimeoutRef.current) {
      clearTimeout(releaseTimeoutRef.current);
    }

    releaseTimeoutRef.current = setTimeout(() => {
      releaseTimeoutRef.current = null;
      interactionActiveRef.current = false;
      onInteractionEnd();
    }, WEB_RELEASE_SETTLE_MS);
  }, [liveValue, onInteractionEnd, onInteractionStart, onValueChange]);

  return (
    <Slider
      maximumTrackTintColor={inactiveTrackColor}
      maximumValue={maximumValue}
      minimumTrackTintColor={activeTrackColor}
      minimumValue={minimumValue}
      onValueChange={handleValueChange}
      step={step}
      style={style}
      thumbTintColor={thumbColor}
      value={value}
    />
  );
}

export const GeofenceRadiusSlider = React.memo(GeofenceRadiusSliderComponent);
