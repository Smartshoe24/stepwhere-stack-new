import { useEffect, useRef, useState, type MutableRefObject } from "react";

import { loadPlacesLibrary } from "../google/google-maps-loader";
import type { SimulatorPlace, SimulatorTravelMode } from "../simulation/simulator-state";

type PlaceRouteBuilderProps = {
  apiKey: string;
  destination: SimulatorPlace | null;
  disabled?: boolean;
  errorMessage?: string | null;
  isBuilding: boolean;
  onBuildRoute: () => void;
  onClear: () => void;
  onDestinationChange: (place: SimulatorPlace | null) => void;
  onOriginChange: (place: SimulatorPlace | null) => void;
  onSwap: () => void;
  onTravelModeChange: (travelMode: SimulatorTravelMode) => void;
  origin: SimulatorPlace | null;
  routeDurationLabel?: string | null;
  routeSummaryLabel?: string | null;
  travelMode: SimulatorTravelMode;
  viewportBias?: google.maps.LatLngBoundsLiteral | null;
};

function getPlaceDescription(place: SimulatorPlace | null) {
  if (!place) {
    return "No place selected.";
  }

  return place.address ? `${place.label} - ${place.address}` : place.label;
}

export function PlaceRouteBuilder({
  apiKey,
  destination,
  disabled = false,
  errorMessage,
  isBuilding,
  onBuildRoute,
  onClear,
  onDestinationChange,
  onOriginChange,
  onSwap,
  onTravelModeChange,
  origin,
  routeDurationLabel,
  routeSummaryLabel,
  travelMode,
  viewportBias,
}: PlaceRouteBuilderProps) {
  const originHostRef = useRef<HTMLDivElement | null>(null);
  const destinationHostRef = useRef<HTMLDivElement | null>(null);
  const originAutocompleteRef = useRef<HTMLElement | null>(null);
  const destinationAutocompleteRef = useRef<HTMLElement | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey.trim()) {
      setLibraryError("Add a Google Maps browser key to use place search.");
      return;
    }

    let cancelled = false;

    async function setupAutocomplete(
      host: HTMLDivElement | null,
      placeholder: string,
      onPlaceChange: (place: SimulatorPlace | null) => void,
      autocompleteRef: MutableRefObject<HTMLElement | null>,
    ) {
      if (!host) {
        return;
      }

      host.innerHTML = "";

      const { PlaceAutocompleteElement } = await loadPlacesLibrary(apiKey);

      if (cancelled) {
        return;
      }

      const autocomplete = new PlaceAutocompleteElement({
        includedRegionCodes: ["in"],
      }) as HTMLElement & {
        disabled?: boolean;
        locationBias?: google.maps.LatLngBoundsLiteral | null;
        placeholder?: string;
      };

      autocomplete.placeholder = placeholder;
      autocomplete.locationBias = viewportBias ?? undefined;
      autocomplete.disabled = disabled;

      const handleSelect = async (event: Event) => {
        const nextEvent = event as google.maps.places.PlacePredictionSelectEvent;
        const placePrediction = nextEvent.placePrediction;

        if (!placePrediction) {
          onPlaceChange(null);
          return;
        }

        const place = placePrediction.toPlace();
        await place.fetchFields({
          fields: ["displayName", "formattedAddress", "location"],
        });

        const location = place.location;

        if (!location) {
          onPlaceChange(null);
          return;
        }

        onPlaceChange({
          placeId: place.id ?? placePrediction.placeId ?? `${location.lat()},${location.lng()}`,
          label: place.displayName ?? "Selected place",
          address: place.formattedAddress ?? null,
          latitude: location.lat(),
          longitude: location.lng(),
        });
      };

      autocomplete.addEventListener("gmp-select", handleSelect as EventListener);
      host.appendChild(autocomplete);
      autocompleteRef.current = autocomplete;
    }

    Promise.all([
      setupAutocomplete(originHostRef.current, "Search origin", onOriginChange, originAutocompleteRef),
      setupAutocomplete(destinationHostRef.current, "Search destination", onDestinationChange, destinationAutocompleteRef),
    ]).then(() => {
      if (!cancelled) {
        setLibraryError(null);
      }
    }).catch((error) => {
      if (!cancelled) {
        setLibraryError(error instanceof Error ? error.message : "Failed to load place search.");
      }
    });

    return () => {
      cancelled = true;
      originAutocompleteRef.current = null;
      destinationAutocompleteRef.current = null;
      if (originHostRef.current) {
        originHostRef.current.innerHTML = "";
      }
      if (destinationHostRef.current) {
        destinationHostRef.current.innerHTML = "";
      }
    };
  }, [apiKey]);

  useEffect(() => {
    const autocompleteElements = [
      originAutocompleteRef.current,
      destinationAutocompleteRef.current,
    ] as Array<(HTMLElement & {
      disabled?: boolean;
      locationBias?: google.maps.LatLngBoundsLiteral | null;
    }) | null>;

    for (const element of autocompleteElements) {
      if (!element) {
        continue;
      }

      element.disabled = disabled;
      element.locationBias = viewportBias ?? undefined;
    }
  }, [disabled, viewportBias]);

  return (
    <div className="place-route-builder">
      {libraryError ? <p className="field__hint field__hint--danger">{libraryError}</p> : null}

      <div className="field field--wide">
        <span>From</span>
        <div className="place-picker" ref={originHostRef} />
        <p className="field__hint">{getPlaceDescription(origin)}</p>
      </div>

      <div className="field field--wide">
        <span>To</span>
        <div className="place-picker" ref={destinationHostRef} />
        <p className="field__hint">{getPlaceDescription(destination)}</p>
      </div>

      <div className="field field--wide">
        <span>Travel mode</span>
        <div className="segmented-control">
          <button
            className={`segmented-control__button${travelMode === "WALKING" ? " segmented-control__button--active" : ""}`}
            disabled={disabled}
            onClick={() => onTravelModeChange("WALKING")}
            type="button">
            Walking
          </button>
          <button
            className={`segmented-control__button${travelMode === "DRIVING" ? " segmented-control__button--active" : ""}`}
            disabled={disabled}
            onClick={() => onTravelModeChange("DRIVING")}
            type="button">
            Driving
          </button>
        </div>
      </div>

      <div className="button-row">
        <button className="button button--outline" disabled={disabled} onClick={onSwap} type="button">
          Swap
        </button>
        <button className="button button--outline" disabled={disabled} onClick={onClear} type="button">
          Clear
        </button>
        <button
          className="button button--primary"
          disabled={disabled || isBuilding || !origin || !destination}
          onClick={onBuildRoute}
          type="button">
          {isBuilding ? "Building..." : "Build route"}
        </button>
      </div>

      {routeSummaryLabel ? (
        <p className="panel__hint">
          {routeSummaryLabel}
          {routeDurationLabel ? ` · ${routeDurationLabel}` : ""}
        </p>
      ) : null}
      {errorMessage ? <p className="field__hint field__hint--danger">{errorMessage}</p> : null}
    </div>
  );
}
