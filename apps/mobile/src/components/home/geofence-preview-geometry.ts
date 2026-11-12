const EARTH_CIRCUMFERENCE_METERS = 40_075_016.686;
const TILE_SIZE_PX = 256;
const MAX_MERCATOR_LATITUDE = 85.051_128_78;

export type GeofencePreviewRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

/** Ground resolution of the Web Mercator tile pyramid at a latitude and zoom. */
export function getMetersPerPixel(latitude: number, zoom: number) {
  'worklet';
  const latitudeRadians = (latitude * Math.PI) / 180;

  return (
    (EARTH_CIRCUMFERENCE_METERS * Math.cos(latitudeRadians))
    / (TILE_SIZE_PX * Math.pow(2, zoom))
  );
}

/** Derives Web Mercator zoom from the longitude span reported by MapView. */
export function getZoomFromLongitudeDelta(longitudeDelta: number, widthPx: number) {
  'worklet';
  if (longitudeDelta <= 0 || widthPx <= 0) {
    return 0;
  }

  return Math.log2((360 * widthPx) / (TILE_SIZE_PX * longitudeDelta));
}

/** Meters per pixel derived directly from the current map viewport. */
export function getMetersPerPixelForRegion(input: {
  latitude: number;
  longitudeDelta: number;
  widthPx: number;
}) {
  'worklet';
  if (input.longitudeDelta <= 0 || input.widthPx <= 0) {
    return 0;
  }

  return getMetersPerPixel(
    input.latitude,
    getZoomFromLongitudeDelta(input.longitudeDelta, input.widthPx),
  );
}

function getMercatorY(latitude: number) {
  'worklet';
  const boundedLatitude = Math.min(
    Math.max(latitude, -MAX_MERCATOR_LATITUDE),
    MAX_MERCATOR_LATITUDE,
  );
  const latitudeRadians = (boundedLatitude * Math.PI) / 180;

  return Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2));
}

/** Projects a coordinate to pixels inside the currently visible map region. */
export function projectCoordinateToScreen(input: {
  latitude: number;
  longitude: number;
  region: GeofencePreviewRegion;
  heightPx: number;
  widthPx: number;
}) {
  'worklet';
  const { region } = input;

  if (
    region.latitudeDelta <= 0
    || region.longitudeDelta <= 0
    || input.heightPx <= 0
    || input.widthPx <= 0
  ) {
    return { x: input.widthPx / 2, y: input.heightPx / 2 };
  }

  const longitudeRatio =
    (input.longitude - (region.longitude - region.longitudeDelta / 2))
    / region.longitudeDelta;
  const northMercatorY = getMercatorY(region.latitude + region.latitudeDelta / 2);
  const centerMercatorY = getMercatorY(region.latitude);
  const southMercatorY = getMercatorY(region.latitude - region.latitudeDelta / 2);
  const latitudeMercatorY = getMercatorY(input.latitude);
  const latitudeRatio = input.latitude >= region.latitude
    ? 0.5 * (
      (northMercatorY - latitudeMercatorY)
      / Math.max(northMercatorY - centerMercatorY, Number.EPSILON)
    )
    : 0.5 + 0.5 * (
      (centerMercatorY - latitudeMercatorY)
      / Math.max(centerMercatorY - southMercatorY, Number.EPSILON)
    );

  return {
    x: longitudeRatio * input.widthPx,
    y: latitudeRatio * input.heightPx,
  };
}

/** Converts a real-world radius into screen pixels without kilometre clamping. */
export function getPreviewRadiusPx(input: {
  radiusMeters: number;
  metersPerPixel: number;
}) {
  'worklet';
  if (input.metersPerPixel <= 0 || input.radiusMeters <= 0) {
    return 0;
  }

  return input.radiusMeters / input.metersPerPixel;
}

/** Linear radius interpolation used by the bounded finger-up transition. */
export function interpolateGeofenceRadius(
  fromRadiusMeters: number,
  toRadiusMeters: number,
  progress: number,
) {
  'worklet';
  const boundedProgress = Math.min(Math.max(progress, 0), 1);

  return fromRadiusMeters
    + (toRadiusMeters - fromRadiusMeters) * boundedProgress;
}
