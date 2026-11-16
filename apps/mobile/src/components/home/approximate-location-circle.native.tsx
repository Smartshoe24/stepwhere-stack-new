import React from 'react';
import { Circle } from 'react-native-maps';

type ApproximateLocationCircleProps = {
  latitude: number;
  longitude: number;
  radiusMeters: number;
};

// Same soft blue Google Maps uses for "you are somewhere in here".
const FILL_COLOR = 'rgba(66, 133, 244, 0.16)';
const STROKE_COLOR = 'rgba(66, 133, 244, 0.45)';

function ApproximateLocationCircleComponent({
  latitude,
  longitude,
  radiusMeters,
}: ApproximateLocationCircleProps) {
  return (
    <Circle
      center={{ latitude, longitude }}
      fillColor={FILL_COLOR}
      radius={radiusMeters}
      strokeColor={STROKE_COLOR}
      strokeWidth={1}
      zIndex={1}
    />
  );
}

export const ApproximateLocationCircle = React.memo(ApproximateLocationCircleComponent);
