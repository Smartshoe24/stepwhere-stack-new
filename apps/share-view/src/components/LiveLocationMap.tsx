import { useEffect, useRef, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import type { PublicShareChildDto } from "@stepwhere/types";

import { getLocationPresentation, type LocationPresentation } from "../utils/location";

type LiveLocationMapProps = {
  apiKey: string;
  child: PublicShareChildDto;
  recenterToken: number;
};

const DEFAULT_CENTER = { lat: 18.5204, lng: 73.8567 };
/** Fixed radius for cell-network estimates, regardless of reported accuracy. */
const APPROX_RADIUS_METERS = 50;
const APPROX_ZOOM = 17;
const DEFAULT_ZOOM = 15;
const ACCURACY_CIRCLE_STYLE = {
  clickable: false,
  fillColor: "#a86516",
  fillOpacity: 0.12,
  strokeColor: "#a86516",
  strokeOpacity: 0.45,
  strokeWeight: 1.5,
} satisfies google.maps.CircleOptions;

function toLatLng(presentation: LocationPresentation) {
  return presentation.kind === "none"
    ? null
    : { lat: presentation.latitude, lng: presentation.longitude };
}

function zoomForPresentation(presentation: LocationPresentation) {
  return presentation.kind === "approximate" ? APPROX_ZOOM : DEFAULT_ZOOM;
}

let mapsLoaderConfiguredKey: string | null = null;
let mapsLoadPromise: Promise<google.maps.MapsLibrary> | null = null;

function loadMapsLibrary(apiKey: string) {
  if (!mapsLoadPromise) {
    setOptions({ key: apiKey, v: "weekly" });
    mapsLoaderConfiguredKey = apiKey;
    mapsLoadPromise = importLibrary("maps") as Promise<google.maps.MapsLibrary>;
  }

  if (mapsLoaderConfiguredKey !== apiKey) {
    throw new Error("Google Maps key changed. Reload the page to apply the new key.");
  }

  return mapsLoadPromise;
}

function toneForTelemetryState(state: PublicShareChildDto["telemetryState"]) {
  switch (state) {
    case "sleep":
      return "sleep";
    case "connecting":
      return "connecting";
    case "offline":
      return "offline";
    case "active":
    default:
      return "online";
  }
}

export function LiveLocationMap({ apiKey, child, recenterToken }: LiveLocationMapProps) {
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlayRef = useRef<google.maps.OverlayView | null>(null);
  const accuracyCircleRef = useRef<google.maps.Circle | null>(null);
  const markerDataRef = useRef(child);
  const hasCenteredRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [mapReadyVersion, setMapReadyVersion] = useState(0);

  markerDataRef.current = child;
  const presentation = getLocationPresentation(child);
  const position = toLatLng(presentation);
  const isApproximate = presentation.kind === "approximate";

  useEffect(() => {
    if (!apiKey.trim()) {
      setError("Add VITE_GOOGLE_MAPS_API_KEY to load the live map.");
      return;
    }

    if (!mapNodeRef.current) {
      return;
    }

    let cancelled = false;
    const win = window as Window & { gm_authFailure?: () => void };
    const previousAuthFailure = win.gm_authFailure;

    async function loadMap() {
      try {
        win.gm_authFailure = () => {
          if (!cancelled) {
            setError("Google Maps rejected this browser key for the share viewer.");
          }
        };

        const { Circle, Map, OverlayView } = await loadMapsLibrary(apiKey);

        if (cancelled || !mapNodeRef.current) {
          return;
        }

        const initial = getLocationPresentation(markerDataRef.current);
        const initialPosition = toLatLng(initial);
        const map = new Map(mapNodeRef.current, {
          center: initialPosition ?? DEFAULT_CENTER,
          clickableIcons: false,
          disableDefaultUI: true,
          gestureHandling: "greedy",
          zoom: initialPosition ? zoomForPresentation(initial) : 12,
        });
        accuracyCircleRef.current = new Circle({ ...ACCURACY_CIRCLE_STYLE, map: null });

        let markerEl: HTMLDivElement | null = null;

        const overlay = new OverlayView();
        overlay.onAdd = () => {
          markerEl = document.createElement("div");
          markerEl.className = "share-marker";
          const pane = overlay.getPanes()?.overlayMouseTarget;
          pane?.appendChild(markerEl);
        };
        overlay.draw = () => {
          if (!markerEl) {
            return;
          }

          const current = markerDataRef.current;
          const currentPosition = toLatLng(getLocationPresentation(current));

          if (!currentPosition) {
            markerEl.style.display = "none";
            return;
          }

          const projection = overlay.getProjection();
          const point = projection?.fromLatLngToDivPixel(new google.maps.LatLng(currentPosition.lat, currentPosition.lng));

          if (!point) {
            return;
          }

          markerEl.style.display = "block";
          markerEl.style.left = `${point.x}px`;
          markerEl.style.top = `${point.y}px`;
          markerEl.dataset.tone = toneForTelemetryState(current.telemetryState);
          markerEl.dataset.approximate = String(current.resolvedPosition?.source === "cell");
          const avatar = document.createElement("div");
          avatar.className = "share-marker__avatar";
          if (current.avatarUrl) {
            const image = document.createElement("img");
            image.alt = current.childName;
            image.src = current.avatarUrl;
            avatar.appendChild(image);
          } else {
            const initials = document.createElement("span");
            initials.textContent = current.initials;
            avatar.appendChild(initials);
          }
          const pointer = document.createElement("div");
          pointer.className = "share-marker__pointer";
          markerEl.replaceChildren(avatar, pointer);
        };
        overlay.onRemove = () => {
          markerEl?.remove();
          markerEl = null;
        };
        overlay.setMap(map);

        mapRef.current = map;
        overlayRef.current = overlay;
        hasCenteredRef.current = Boolean(initialPosition);
        setMapReadyVersion((value) => value + 1);
        setError(null);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Failed to load the live map.");
      }
    }

    void loadMap();

    return () => {
      cancelled = true;
      win.gm_authFailure = previousAuthFailure;
      overlayRef.current?.setMap(null);
      overlayRef.current = null;
      accuracyCircleRef.current?.setMap(null);
      accuracyCircleRef.current = null;
      mapRef.current = null;
    };
  }, [apiKey]);

  // Redraw the marker and keep the accuracy circle in sync with every update.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    overlayRef.current?.draw();

    const circle = accuracyCircleRef.current;
    if (circle) {
      if (position && isApproximate) {
        circle.setCenter(position);
        circle.setRadius(APPROX_RADIUS_METERS);
        circle.setMap(map);
      } else {
        circle.setMap(null);
      }
    }

    if (position && !hasCenteredRef.current) {
      map.setCenter(position);
      map.setZoom(zoomForPresentation(presentation));
      hasCenteredRef.current = true;
    }
    // presentation and position are derived from child.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [child, mapReadyVersion]);

  useEffect(() => {
    if (!mapRef.current || !position) {
      return;
    }

    mapRef.current.panTo(position);
    mapRef.current.setZoom(zoomForPresentation(presentation));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.lat, position?.lng, isApproximate, recenterToken]);

  return (
    <section className="map-shell">
      <div className="map-canvas" ref={mapNodeRef} />
      {error ? (
        <div className="map-overlay">
          <strong>Map unavailable</strong>
          <p>Live status is still updating. Try reloading the map in a moment.</p>
        </div>
      ) : null}
      {!error && presentation.kind === "none" ? (
        <div className="map-overlay">
          <strong>Waiting for the first location update</strong>
          <p>The link is active. The map will place the child once telemetry arrives.</p>
        </div>
      ) : null}
    </section>
  );
}
