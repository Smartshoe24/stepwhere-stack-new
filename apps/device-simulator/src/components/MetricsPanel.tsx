type MetricsPanelProps = {
  batteryPercent: number;
  batteryVoltageMv: number;
  currentLatitude: number | null;
  currentLongitude: number | null;
  currentSpeedKmh: number;
  cellularProfileName: string;
  distanceLabel: string;
  lastResponseStatus: number | null;
  lastSentAt: string | null;
  lastStepDelta: number;
  progressPercent: number;
  samplesSent: number;
  gpsEnabled: boolean;
  satelliteCount: number;
  signalStrength: number;
  stepCounter: number;
  totalDistanceLabel: string;
};

export function MetricsPanel({
  batteryPercent,
  batteryVoltageMv,
  currentLatitude,
  currentLongitude,
  currentSpeedKmh,
  cellularProfileName,
  distanceLabel,
  lastResponseStatus,
  lastSentAt,
  lastStepDelta,
  progressPercent,
  samplesSent,
  gpsEnabled,
  satelliteCount,
  signalStrength,
  stepCounter,
  totalDistanceLabel,
}: MetricsPanelProps) {
  const items = [
    ["Latitude", currentLatitude?.toFixed(6) ?? "No route"],
    ["Longitude", currentLongitude?.toFixed(6) ?? "No route"],
    ["Distance traveled", distanceLabel],
    ["Total route", totalDistanceLabel],
    ["Progress", `${progressPercent.toFixed(1)}%`],
    ["Speed", `${currentSpeedKmh.toFixed(1)} km/h`],
    ["Location mode", gpsEnabled ? "GPS" : "Cell fallback"],
    ["Cell profile", cellularProfileName],
    ["Step counter", `${stepCounter}`],
    ["Last step delta", `${lastStepDelta}`],
    ["Battery", `${batteryPercent.toFixed(1)}%`],
    ["Voltage", `${Math.round(batteryVoltageMv)} mV`],
    ["Signal", `${signalStrength}/5`],
    ["Satellites", gpsEnabled ? `${satelliteCount}` : "0 (GPS disabled)"],
    ["Samples sent", `${samplesSent}`],
    ["Last response", lastResponseStatus ? `${lastResponseStatus}` : "None"],
    ["Last send time", lastSentAt ? new Date(lastSentAt).toLocaleTimeString() : "Never"],
  ];

  return (
    <section className="panel">
      <div className="panel__heading">
        <h2>Metrics</h2>
      </div>
      <div className="metrics-compact-grid">
        {items.map(([label, value]) => (
          <div className="metric-row" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
