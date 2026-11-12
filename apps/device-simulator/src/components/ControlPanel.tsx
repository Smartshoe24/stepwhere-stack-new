import type { PersistedSimulatorState, SimulatorRunState } from "../simulation/simulator-state";

type ControlPanelProps = {
  cellularProfileError: string | null;
  onAddCellularProfile: () => void;
  onCellularProfileChange: (key: "name" | "payloadJson", value: string) => void;
  onDeleteCellularProfile: () => void;
  onFieldChange: <K extends keyof PersistedSimulatorState>(key: K, value: PersistedSimulatorState[K]) => void;
  onPause: () => void;
  onResetJourney: () => void;
  onResetSettings: () => void;
  onResetStepCounter: () => void;
  onResume: () => void;
  onSendOneSample: () => void;
  onSelectCellularProfile: (profileId: string) => void;
  onStartJourney: () => void;
  onStopJourney: () => void;
  googleMapsKeyChanged: boolean;
  revealGoogleMapsApiKey: boolean;
  revealApiKey: boolean;
  runState: SimulatorRunState;
  simulationTimingError: string | null;
  setRevealGoogleMapsApiKey: (value: boolean) => void;
  setRevealApiKey: (value: boolean) => void;
  settings: PersistedSimulatorState;
};

export function ControlPanel({
  cellularProfileError,
  onAddCellularProfile,
  onCellularProfileChange,
  onDeleteCellularProfile,
  onFieldChange,
  onPause,
  onResetJourney,
  onResetSettings,
  onResetStepCounter,
  onResume,
  onSendOneSample,
  onSelectCellularProfile,
  onStartJourney,
  onStopJourney,
  googleMapsKeyChanged,
  revealGoogleMapsApiKey,
  revealApiKey,
  runState,
  simulationTimingError,
  setRevealGoogleMapsApiKey,
  setRevealApiKey,
  settings,
}: ControlPanelProps) {
  const canPause = runState === "running" || runState === "sleep";
  const canResume = runState === "paused" || runState === "offline" || runState === "stopped";
  const selectedCellularProfile = settings.cellularProfiles.find(
    (profile) => profile.id === settings.selectedCellularProfileId,
  ) ?? settings.cellularProfiles[0];
  const timingWarning = settings.enableCellLookupTimingOverride
    && settings.sendIntervalSeconds > settings.cellLookupFastIntervalSeconds
    ? "The effective fast cadence cannot be quicker than the telemetry send interval."
    : null;

  return (
    <section className="panel">
      <div className="panel__heading">
        <h2>Simulator controls</h2>
        <button className="button button--ghost" onClick={onResetSettings} type="button">
          Restore defaults
        </button>
      </div>

      <div className="field-grid">
        <label className="field">
          <span>API URL</span>
          <input
            onChange={(event) => onFieldChange("apiUrl", event.target.value)}
            type="url"
            value={settings.apiUrl}
          />
        </label>

        <label className="field">
          <span>Hardware ID</span>
          <input
            onChange={(event) => onFieldChange("hardwareIdentifier", event.target.value.toUpperCase())}
            value={settings.hardwareIdentifier}
          />
        </label>

        <label className="field field--wide">
          <span>Device ingest key</span>
          <div className="field__inline">
            <input
              onChange={(event) => onFieldChange("ingestApiKey", event.target.value)}
              type={revealApiKey ? "text" : "password"}
              value={settings.ingestApiKey}
            />
            <button
              className="button button--ghost button--small"
              onClick={() => setRevealApiKey(!revealApiKey)}
              type="button">
              {revealApiKey ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        <div className="control-subsection field--wide">
          <div className="control-subsection__heading">
            <div>
              <h3>Location source</h3>
              <p>Route coordinates are ignored by the backend when the GPS fix is invalid.</p>
            </div>
          </div>

          <label className="field field--checkbox">
            <input
              checked={settings.gpsEnabled}
              onChange={(event) => onFieldChange("gpsEnabled", event.target.checked)}
              type="checkbox"
            />
            <span>GPS enabled</span>
          </label>

          <div className="cellular-profile-toolbar">
            <label className="field">
              <span>LTE cell profile</span>
              <select
                onChange={(event) => onSelectCellularProfile(event.target.value)}
                value={selectedCellularProfile?.id ?? ""}>
                {settings.cellularProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.name}</option>
                ))}
              </select>
            </label>
            <div className="button-row button-row--compact">
              <button className="button button--ghost button--small" onClick={onAddCellularProfile} type="button">
                Add profile
              </button>
              <button
                className="button button--ghost button--small"
                disabled={settings.cellularProfiles.length <= 1}
                onClick={onDeleteCellularProfile}
                type="button">
                Delete
              </button>
            </div>
          </div>

          <label className="field">
            <span>Profile name</span>
            <input
              onChange={(event) => onCellularProfileChange("name", event.target.value)}
              value={selectedCellularProfile?.name ?? ""}
            />
          </label>

          <label className="field">
            <span>Cellular payload JSON</span>
            <textarea
              aria-invalid={Boolean(cellularProfileError)}
              className="json-editor"
              onChange={(event) => onCellularProfileChange("payloadJson", event.target.value)}
              spellCheck={false}
              value={selectedCellularProfile?.payloadJson ?? ""}
            />
            {cellularProfileError ? (
              <span className="field__hint field__hint--danger">{cellularProfileError}</span>
            ) : (
              <span className="field__hint">One serving tower is required; up to 15 neighbors may be added.</span>
            )}
          </label>

          <label className="field field--checkbox">
            <input
              checked={settings.enableCellLookupTimingOverride}
              onChange={(event) => onFieldChange("enableCellLookupTimingOverride", event.target.checked)}
              type="checkbox"
            />
            <span>Use accelerated cell lookup timing (development only)</span>
          </label>

          {settings.enableCellLookupTimingOverride ? (
            <div className="field-grid">
              <label className="field">
                <span>Normal lookup interval (s)</span>
                <input
                  max="420"
                  min="1"
                  onChange={(event) => onFieldChange("cellLookupNormalIntervalSeconds", Number(event.target.value) || 1)}
                  type="number"
                  value={settings.cellLookupNormalIntervalSeconds}
                />
              </label>
              <label className="field">
                <span>Fast lookup interval (s)</span>
                <input
                  max="60"
                  min="1"
                  onChange={(event) => onFieldChange("cellLookupFastIntervalSeconds", Number(event.target.value) || 1)}
                  type="number"
                  value={settings.cellLookupFastIntervalSeconds}
                />
              </label>
              {simulationTimingError ? (
                <p className="field__hint field__hint--danger field--wide">{simulationTimingError}</p>
              ) : timingWarning ? (
                <p className="field__hint field--wide">{timingWarning}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        <label className="field field--wide">
          <span>Google Maps API key</span>
          <div className="field__inline">
            <input
              onChange={(event) => onFieldChange("googleMapsApiKey", event.target.value)}
              type={revealGoogleMapsApiKey ? "text" : "password"}
              value={settings.googleMapsApiKey}
            />
            <button
              className="button button--ghost button--small"
              onClick={() => setRevealGoogleMapsApiKey(!revealGoogleMapsApiKey)}
              type="button">
              {revealGoogleMapsApiKey ? "Hide" : "Show"}
            </button>
          </div>
          {googleMapsKeyChanged ? (
            <span className="field__hint">Reload the simulator after changing the Google Maps key.</span>
          ) : null}
        </label>

        <label className="field">
          <span>Send interval (s)</span>
          <input
            min="1"
            onChange={(event) => onFieldChange("sendIntervalSeconds", Number(event.target.value) || 1)}
            type="number"
            value={settings.sendIntervalSeconds}
          />
        </label>

        <label className="field">
          <span>Speed (km/h)</span>
          <input
            min="1"
            onChange={(event) => onFieldChange("speedKmh", Number(event.target.value) || 1)}
            step="0.5"
            type="number"
            value={settings.speedKmh}
          />
        </label>

        <label className="field">
          <span>Stride length (m)</span>
          <input
            min="0.2"
            onChange={(event) => onFieldChange("strideLengthMeters", Number(event.target.value) || 0.2)}
            step="0.05"
            type="number"
            value={settings.strideLengthMeters}
          />
        </label>

        <label className="field">
          <span>Initial step counter</span>
          <input
            min="0"
            onChange={(event) => onFieldChange("initialStepCounter", Number(event.target.value) || 0)}
            type="number"
            value={settings.initialStepCounter}
          />
        </label>

        <label className="field">
          <span>Battery percent</span>
          <input
            max="100"
            min="0"
            onChange={(event) => onFieldChange("initialBatteryPercent", Number(event.target.value) || 0)}
            type="number"
            value={settings.initialBatteryPercent}
          />
        </label>

        <label className="field">
          <span>Battery voltage (mV)</span>
          <input
            disabled={settings.useAutoBatteryVoltage}
            min="3000"
            onChange={(event) => onFieldChange("initialBatteryVoltageMv", Number(event.target.value) || 3000)}
            step="10"
            type="number"
            value={settings.initialBatteryVoltageMv}
          />
        </label>

        <label className="field field--checkbox">
          <input
            checked={settings.useAutoBatteryVoltage}
            onChange={(event) => onFieldChange("useAutoBatteryVoltage", event.target.checked)}
            type="checkbox"
          />
          <span>Auto voltage from battery percent</span>
        </label>

        <label className="field">
          <span>Signal strength</span>
          <input
            max="5"
            min="0"
            onChange={(event) => onFieldChange("initialSignalStrength", Number(event.target.value) || 0)}
            type="number"
            value={settings.initialSignalStrength}
          />
        </label>

        <label className="field">
          <span>Satellite count</span>
          <input
            disabled={!settings.gpsEnabled}
            max="32"
            min="0"
            onChange={(event) => onFieldChange("initialSatelliteCount", Number(event.target.value) || 0)}
            type="number"
            value={settings.initialSatelliteCount}
          />
        </label>

        <label className="field field--checkbox">
          <input
            checked={settings.enableMetricJitter}
            onChange={(event) => onFieldChange("enableMetricJitter", event.target.checked)}
            type="checkbox"
          />
          <span>Enable signal and satellite jitter</span>
        </label>
      </div>

      <div className="button-row">
        <button className="button button--primary" onClick={onStartJourney} type="button">
          Start Journey
        </button>
        <button className="button button--outline" disabled={!canPause} onClick={onPause} type="button">
          Pause
        </button>
        <button className="button button--outline" disabled={!canResume} onClick={onResume} type="button">
          Resume
        </button>
        <button className="button button--outline" onClick={onStopJourney} type="button">
          Stop
        </button>
        <button className="button button--outline" onClick={onResetJourney} type="button">
          Reset Journey
        </button>
        <button className="button button--outline" onClick={onSendOneSample} type="button">
          Send One Sample
        </button>
      </div>

      <div className="button-row">
        <button className="button button--ghost" onClick={onResetStepCounter} type="button">
          Reset Step Counter to 0
        </button>
      </div>
    </section>
  );
}
