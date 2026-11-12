const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function haversineDistanceMeters(input: {
  fromLatitude: number;
  fromLongitude: number;
  toLatitude: number;
  toLongitude: number;
}) {
  const latitudeDelta = toRadians(input.toLatitude - input.fromLatitude);
  const longitudeDelta = toRadians(input.toLongitude - input.fromLongitude);
  const fromLatitudeRadians = toRadians(input.fromLatitude);
  const toLatitudeRadians = toRadians(input.toLatitude);

  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitudeRadians)
      * Math.cos(toLatitudeRadians)
      * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
