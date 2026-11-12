import { ROUTE_PRESETS } from "../simulation/presets";
import type {
  RouteEditorMode,
  SimulatorPlace,
  SimulatorTravelMode,
  Waypoint,
} from "../simulation/simulator-state";
import { PlaceRouteBuilder } from "./PlaceRouteBuilder";

type RoutePanelProps = {
  destinationPlace: SimulatorPlace | null;
  generatedRouteDistanceLabel: string | null;
  generatedRouteDurationLabel: string | null;
  isBuildingRoute: boolean;
  isRouteLocked: boolean;
  onBuildGeneratedRoute: () => void;
  onClearGeneratedRoute: () => void;
  onClearRoute: () => void;
  onDestinationPlaceChange: (place: SimulatorPlace | null) => void;
  onOriginPlaceChange: (place: SimulatorPlace | null) => void;
  onPresetChange: (presetId: string) => void;
  onReverseRoute: () => void;
  onRouteEditorModeChange: (mode: RouteEditorMode) => void;
  onSwapPlaces: () => void;
  onTravelModeChange: (travelMode: SimulatorTravelMode) => void;
  onWaypointRemove: (waypointId: string) => void;
  onWaypointSelect: (waypointId: string) => void;
  onWaypointUpdate: (waypointId: string, key: "latitude" | "longitude", value: number) => void;
  originPlace: SimulatorPlace | null;
  routeBuildError: string | null;
  routeEditorMode: RouteEditorMode;
  selectedPresetId: string;
  selectedWaypointId: string | null;
  totalDistanceLabel: string;
  travelMode: SimulatorTravelMode;
  viewportBias?: google.maps.LatLngBoundsLiteral | null;
  waypoints: Waypoint[];
  googleMapsApiKey: string;
};

export function RoutePanel({
  destinationPlace,
  generatedRouteDistanceLabel,
  generatedRouteDurationLabel,
  googleMapsApiKey,
  isBuildingRoute,
  isRouteLocked,
  onBuildGeneratedRoute,
  onClearGeneratedRoute,
  onClearRoute,
  onDestinationPlaceChange,
  onOriginPlaceChange,
  onPresetChange,
  onReverseRoute,
  onRouteEditorModeChange,
  onSwapPlaces,
  onTravelModeChange,
  onWaypointRemove,
  onWaypointSelect,
  onWaypointUpdate,
  originPlace,
  routeBuildError,
  routeEditorMode,
  selectedPresetId,
  selectedWaypointId,
  totalDistanceLabel,
  travelMode,
  viewportBias,
  waypoints,
}: RoutePanelProps) {
  const start = waypoints[0] ?? null;
  const end = waypoints[waypoints.length - 1] ?? null;

  return (
    <section className="panel">
      <div className="panel__heading">
        <h2>Route</h2>
        <span className="panel__meta">{totalDistanceLabel}</span>
      </div>

      <div className="segmented-control segmented-control--full">
        <button
          className={`segmented-control__button${routeEditorMode === "manual" ? " segmented-control__button--active" : ""}`}
          onClick={() => onRouteEditorModeChange("manual")}
          type="button">
          Manual
        </button>
        <button
          className={`segmented-control__button${routeEditorMode === "places" ? " segmented-control__button--active" : ""}`}
          onClick={() => onRouteEditorModeChange("places")}
          type="button">
          Places
        </button>
      </div>

      {routeEditorMode === "manual" ? (
        <>
          <div className="field-grid">
            <label className="field field--wide">
              <span>Preset route</span>
              <select disabled={isRouteLocked} onChange={(event) => onPresetChange(event.target.value)} value={selectedPresetId}>
                {selectedPresetId === "custom" ? (
                  <option value="custom">Custom route</option>
                ) : null}
                {ROUTE_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Start latitude</span>
              <input
                disabled={isRouteLocked || !start}
                onChange={(event) => start && onWaypointUpdate(start.id, "latitude", Number(event.target.value) || 0)}
                step="0.000001"
                type="number"
                value={start?.latitude ?? ""}
              />
            </label>

            <label className="field">
              <span>Start longitude</span>
              <input
                disabled={isRouteLocked || !start}
                onChange={(event) => start && onWaypointUpdate(start.id, "longitude", Number(event.target.value) || 0)}
                step="0.000001"
                type="number"
                value={start?.longitude ?? ""}
              />
            </label>

            <label className="field">
              <span>End latitude</span>
              <input
                disabled={isRouteLocked || !end}
                onChange={(event) => end && onWaypointUpdate(end.id, "latitude", Number(event.target.value) || 0)}
                step="0.000001"
                type="number"
                value={end?.latitude ?? ""}
              />
            </label>

            <label className="field">
              <span>End longitude</span>
              <input
                disabled={isRouteLocked || !end}
                onChange={(event) => end && onWaypointUpdate(end.id, "longitude", Number(event.target.value) || 0)}
                step="0.000001"
                type="number"
                value={end?.longitude ?? ""}
              />
            </label>
          </div>

          <div className="button-row">
            <button className="button button--outline" disabled={isRouteLocked} onClick={onReverseRoute} type="button">
              Reverse Route
            </button>
            <button className="button button--outline" disabled={isRouteLocked} onClick={onClearRoute} type="button">
              Clear Route
            </button>
          </div>

          <p className="panel__hint">Click on the map to add a waypoint. Drag markers on the map to refine the path.</p>

          <div className="waypoint-list">
            {waypoints.map((waypoint, index) => (
              <div
                className={`waypoint-row${selectedWaypointId === waypoint.id ? " waypoint-row--selected" : ""}`}
                key={waypoint.id}
                onClick={() => onWaypointSelect(waypoint.id)}>
                <div className="waypoint-row__header">
                  <span>Waypoint {index + 1}</span>
                  <button
                    className="button button--ghost button--small"
                    disabled={isRouteLocked}
                    onClick={(event) => {
                      event.stopPropagation();
                      onWaypointRemove(waypoint.id);
                    }}
                    type="button">
                    Remove
                  </button>
                </div>
                <div className="waypoint-row__fields">
                  <input
                    disabled={isRouteLocked}
                    onChange={(event) => onWaypointUpdate(waypoint.id, "latitude", Number(event.target.value) || 0)}
                    step="0.000001"
                    type="number"
                    value={waypoint.latitude}
                  />
                  <input
                    disabled={isRouteLocked}
                    onChange={(event) => onWaypointUpdate(waypoint.id, "longitude", Number(event.target.value) || 0)}
                    step="0.000001"
                    type="number"
                    value={waypoint.longitude}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <PlaceRouteBuilder
          apiKey={googleMapsApiKey}
          destination={destinationPlace}
          disabled={isRouteLocked}
          errorMessage={routeBuildError}
          isBuilding={isBuildingRoute}
          onBuildRoute={onBuildGeneratedRoute}
          onClear={onClearGeneratedRoute}
          onDestinationChange={onDestinationPlaceChange}
          onOriginChange={onOriginPlaceChange}
          onSwap={onSwapPlaces}
          onTravelModeChange={onTravelModeChange}
          origin={originPlace}
          routeDurationLabel={generatedRouteDurationLabel}
          routeSummaryLabel={generatedRouteDistanceLabel}
          travelMode={travelMode}
          viewportBias={viewportBias}
        />
      )}
    </section>
  );
}
