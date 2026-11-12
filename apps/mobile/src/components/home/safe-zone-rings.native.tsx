import React from 'react';
import { Circle, Polyline } from 'react-native-maps';
import { useUnistyles } from 'react-native-unistyles';

import { getGeofenceRingColors } from '@/components/home/geofence-presentation';

type SafeZoneRingsProps = {
  latitude: number;
  longitude: number;
  pending?: boolean;
  radiusMeters: number;
  status?: "enabled" | "breached";
  visible: boolean;
};

const EARTH_RADIUS_METERS = 6371000;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function getCircleOutlineCoordinates(
  latitude: number,
  longitude: number,
  radiusMeters: number,
  pointCount = 48,
) {
  const angularDistance = radiusMeters / EARTH_RADIUS_METERS;
  const latitudeRadians = toRadians(latitude);
  const longitudeRadians = toRadians(longitude);
  const coordinates = [];

  for (let index = 0; index <= pointCount; index += 1) {
    const bearing = (index / pointCount) * Math.PI * 2;
    const nextLatitude = Math.asin(
      Math.sin(latitudeRadians) * Math.cos(angularDistance)
        + Math.cos(latitudeRadians) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const nextLongitude = longitudeRadians + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitudeRadians),
      Math.cos(angularDistance) - Math.sin(latitudeRadians) * Math.sin(nextLatitude),
    );

    coordinates.push({
      latitude: toDegrees(nextLatitude),
      longitude: toDegrees(nextLongitude),
    });
  }

  return coordinates;
}

function SafeZoneRingsComponent({
  latitude,
  longitude,
  pending = false,
  radiusMeters,
  status = "enabled",
  visible,
}: SafeZoneRingsProps) {
  const { theme } = useUnistyles();
  const ringColors = getGeofenceRingColors(theme, status, pending);
  const outlineCoordinates = React.useMemo(
    () => getCircleOutlineCoordinates(latitude, longitude, radiusMeters),
    [latitude, longitude, radiusMeters],
  );

  if (!visible || radiusMeters <= 0) {
    return null;
  }

  return (
    <>
      <Circle
        center={{ latitude, longitude }}
        fillColor={ringColors.fill}
        radius={radiusMeters}
        strokeColor="rgba(0, 0, 0, 0)"
        strokeWidth={0}
        zIndex={1}
      />
      <Polyline
        coordinates={outlineCoordinates}
        lineCap="round"
        lineDashPattern={[1, 6]}
        strokeColor={ringColors.stroke}
        strokeWidth={2}
        zIndex={2}
      />
    </>
  );
}

export const SafeZoneRings = React.memo(SafeZoneRingsComponent);
