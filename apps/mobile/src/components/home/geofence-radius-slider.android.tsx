import { Host, Slider } from '@expo/ui/jetpack-compose';
import React from 'react';

import type { GeofenceRadiusSliderProps } from './geofence-radius-slider.types';

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
  const interactionActiveRef = React.useRef(false);
  const steps = Math.max(
    0,
    Math.round((maximumValue - minimumValue) / Math.max(step, 1)) - 1,
  );

  const handleValueChange = React.useCallback((nextValue: number) => {
    if (!interactionActiveRef.current) {
      interactionActiveRef.current = true;
      onInteractionStart();
    }

    liveValue.set(nextValue);
    onValueChange(nextValue);
  }, [liveValue, onInteractionStart, onValueChange]);

  const handleValueChangeFinished = React.useCallback(() => {
    if (!interactionActiveRef.current) {
      return;
    }

    interactionActiveRef.current = false;
    onInteractionEnd();
  }, [onInteractionEnd]);

  return (
    <Host matchContents={{ vertical: true }} style={style}>
      <Slider
        colors={{
          activeTrackColor,
          inactiveTrackColor,
          thumbColor,
        }}
        max={maximumValue}
        min={minimumValue}
        onValueChange={handleValueChange}
        onValueChangeFinished={handleValueChangeFinished}
        steps={steps}
        value={value}
      />
    </Host>
  );
}

export const GeofenceRadiusSlider = React.memo(GeofenceRadiusSliderComponent);
