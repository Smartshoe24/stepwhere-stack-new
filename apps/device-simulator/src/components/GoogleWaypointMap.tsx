import { useEffect, useRef, useState } from "react";

import { loadMapsLibrary } from "../google/google-maps-loader";
import type { RouteEditorMode, SimulatorPlace, Waypoint } from "../simulation/simulator-state";

type GoogleWaypointMapProps = {
  apiKey: string;
  currentPosition: Waypoint | null;
  destinationPlace: SimulatorPlace | null;
  generatedRoutePoints: Waypoint[];
  isRouteLocked: boolean;
  onViewportBiasChange?: (bounds: google.maps.LatLngBoundsLiteral | null) => void;
  onWaypointAdd: (latitude: number, longitude: number) => void;
  onWaypointSelect: (waypointId: string) => void;
  onWaypointUpdate: (waypointId: string, latitude: number, longitude: number) => void;
  originPlace: SimulatorPlace | null;
  routeEditorMode: RouteEditorMode;
  selectedWaypointId: string | null;
  themeMode: "light" | "dark";
  waypoints: Waypoint[];
};

const PUNE_CENTER = { lat: 18.5204, lng: 73.8567 };
const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0f172a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#cbd5e1" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0f172a" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#334155" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#111827" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#17222f" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1f2937" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#111827" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#1e293b" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#13283f" }] },
];

function getExpectedOrigin() {
  if (typeof window === "undefined") {
    return "http://127.0.0.1:5174";
  }

  return window.location.origin;
}

function toLatLngLiteral(point: Waypoint | SimulatorPlace) {
  return { lat: point.latitude, lng: point.longitude };
}

function toViewportCoordinateKey(point: Waypoint | SimulatorPlace) {
  return `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
}

export function GoogleWaypointMap({
  apiKey,
  currentPosition,
  destinationPlace,
  generatedRoutePoints,
  isRouteLocked,
  onViewportBiasChange,
  onWaypointAdd,
  onWaypointSelect,
  onWaypointUpdate,
  originPlace,
  routeEditorMode,
  selectedWaypointId,
  themeMode,
  waypoints,
}: GoogleWaypointMapProps) {
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const mapsRef = useRef<typeof google.maps | null>(null);
  const routeEditorModeRef = useRef(routeEditorMode);
  const isRouteLockedRef = useRef(isRouteLocked);
  const waypointMarkersRef = useRef<google.maps.Marker[]>([]);
  const endpointMarkersRef = useRef<google.maps.Marker[]>([]);
  const currentMarkerRef = useRef<google.maps.Marker | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const lastViewportKeyRef = useRef<string | null>(null);
  const onWaypointAddRef = useRef(onWaypointAdd);
  const onWaypointSelectRef = useRef(onWaypointSelect);
  const onWaypointUpdateRef = useRef(onWaypointUpdate);
  const [error, setError] = useState<string | null>(null);

  onWaypointAddRef.current = onWaypointAdd;
  onWaypointSelectRef.current = onWaypointSelect;
  onWaypointUpdateRef.current = onWaypointUpdate;
  routeEditorModeRef.current = routeEditorMode;
  isRouteLockedRef.current = isRouteLocked;

  useEffect(() => {
    if (!apiKey.trim()) {
      setError("Add VITE_GOOGLE_MAPS_API_KEY or enter one in the simulator environment.");
      return;
    }

    if (!mapNodeRef.current) {
      return;
    }

    let cancelled = false;
    const windowWithMapsAuth = window as Window & { gm_authFailure?: () => void };
    const previousAuthFailure = windowWithMapsAuth.gm_authFailure;
    const expectedOrigin = getExpectedOrigin();

    async function loadMap() {
      try {
        windowWithMapsAuth.gm_authFailure = () => {
          if (!cancelled) {
            setError(
              `Google Maps rejected this browser key. Check billing, Maps JavaScript API access, and referrer access for ${expectedOrigin}.`,
            );
          }
        };

        const { Map } = await loadMapsLibrary(apiKey);

        if (cancelled || !mapNodeRef.current) {
          return;
        }

        mapsRef.current = google.maps;
        const map = new Map(mapNodeRef.current, {
          center: PUNE_CENTER,
          clickableIcons: false,
          disableDefaultUI: false,
          gestureHandling: "greedy",
          mapTypeControl: false,
          streetViewControl: false,
          styles: themeMode === "dark" ? DARK_MAP_STYLES : undefined,
          zoom: 13,
        });

        map.addListener("click", (event: google.maps.MapMouseEvent) => {
          if (routeEditorModeRef.current !== "manual" || isRouteLockedRef.current) {
            return;
          }

          const latitude = event.latLng?.lat();
          const longitude = event.latLng?.lng();

          if (latitude === undefined || longitude === undefined) {
            return;
          }

          onWaypointAddRef.current(latitude, longitude);
        });

        map.addListener("idle", () => {
          const bounds = map.getBounds();

          if (!bounds) {
            onViewportBiasChange?.(null);
            return;
          }

          const northEast = bounds.getNorthEast();
          const southWest = bounds.getSouthWest();

          onViewportBiasChange?.({
            east: northEast.lng(),
            north: northEast.lat(),
            south: southWest.lat(),
            west: southWest.lng(),
          });
        });

        mapRef.current = map;
        lastViewportKeyRef.current = null;
        setError(null);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Failed to load Google Maps.");
      }
    }

    void loadMap();

    return () => {
      cancelled = true;
      windowWithMapsAuth.gm_authFailure = previousAuthFailure;
      waypointMarkersRef.current.forEach((marker) => marker.setMap(null));
      endpointMarkersRef.current.forEach((marker) => marker.setMap(null));
      waypointMarkersRef.current = [];
      endpointMarkersRef.current = [];
      currentMarkerRef.current?.setMap(null);
      currentMarkerRef.current = null;
      polylineRef.current?.setMap(null);
      polylineRef.current = null;
      mapRef.current = null;
    };
  }, [apiKey, onViewportBiasChange]);

  useEffect(() => {
    mapRef.current?.setOptions({
      styles: themeMode === "dark" ? DARK_MAP_STYLES : undefined,
    });
  }, [themeMode]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;

    if (!map || !maps) {
      return;
    }

    waypointMarkersRef.current.forEach((marker) => marker.setMap(null));
    endpointMarkersRef.current.forEach((marker) => marker.setMap(null));
    waypointMarkersRef.current = [];
    endpointMarkersRef.current = [];
    polylineRef.current?.setMap(null);
    polylineRef.current = null;

    if (routeEditorMode === "manual") {
      waypointMarkersRef.current = waypoints.map((waypoint) => {
        const marker = new maps.Marker({
          draggable: !isRouteLocked,
          map,
          position: toLatLngLiteral(waypoint),
          title: waypoint.id,
        });

        marker.addListener("click", () => onWaypointSelectRef.current(waypoint.id));
        marker.addListener("dragend", () => {
          const position = marker.getPosition();

          if (!position || isRouteLocked) {
            return;
          }

          onWaypointUpdateRef.current(waypoint.id, position.lat(), position.lng());
        });

        marker.setIcon({
          path: maps.SymbolPath.CIRCLE,
          fillColor: selectedWaypointId === waypoint.id ? "#F97316" : "#208AEF",
          fillOpacity: 1,
          scale: selectedWaypointId === waypoint.id ? 10 : 8,
          strokeColor: selectedWaypointId === waypoint.id ? "#111827" : "#FFFFFF",
          strokeWeight: 2,
        });

        return marker;
      });

      if (waypoints.length >= 2) {
        polylineRef.current = new maps.Polyline({
          map,
          path: waypoints.map(toLatLngLiteral),
          strokeColor: "#16A34A",
          strokeOpacity: 0.9,
          strokeWeight: 4,
        });
      }

      const nextViewportKey = waypoints.length > 0
        ? `manual:${waypoints.map(toViewportCoordinateKey).join("|")}`
        : "manual:empty";

      if (lastViewportKeyRef.current === nextViewportKey) {
        return;
      }

      lastViewportKeyRef.current = nextViewportKey;

      if (waypoints.length > 0) {
        const bounds = new maps.LatLngBounds();
        waypoints.forEach((waypoint) => bounds.extend(toLatLngLiteral(waypoint)));
        map.fitBounds(bounds, 64);
      } else {
        map.setCenter(PUNE_CENTER);
        map.setZoom(12);
      }

      return;
    }

    const nextViewportKey = generatedRoutePoints.length >= 2
      ? `generated:${generatedRoutePoints.map(toViewportCoordinateKey).join("|")}`
      : [
        originPlace ? `origin:${toViewportCoordinateKey(originPlace)}` : "origin:none",
        destinationPlace ? `destination:${toViewportCoordinateKey(destinationPlace)}` : "destination:none",
      ].join(":");

    if (originPlace) {
      endpointMarkersRef.current.push(new maps.Marker({
        icon: {
          path: maps.SymbolPath.CIRCLE,
          fillColor: "#208AEF",
          fillOpacity: 1,
          scale: 8,
          strokeColor: "#FFFFFF",
          strokeWeight: 2,
        },
        map,
        position: toLatLngLiteral(originPlace),
        title: "Origin",
      }));
    }

    if (destinationPlace) {
      endpointMarkersRef.current.push(new maps.Marker({
        icon: {
          path: maps.SymbolPath.CIRCLE,
          fillColor: "#F97316",
          fillOpacity: 1,
          scale: 8,
          strokeColor: "#111827",
          strokeWeight: 2,
        },
        map,
        position: toLatLngLiteral(destinationPlace),
        title: "Destination",
      }));
    }

    if (generatedRoutePoints.length >= 2) {
      if (lastViewportKeyRef.current === nextViewportKey) {
        return;
      }

      lastViewportKeyRef.current = nextViewportKey;
      polylineRef.current = new maps.Polyline({
        map,
        path: generatedRoutePoints.map(toLatLngLiteral),
        strokeColor: "#16A34A",
        strokeOpacity: 0.92,
        strokeWeight: 4,
      });
      const bounds = new maps.LatLngBounds();
      generatedRoutePoints.forEach((point) => bounds.extend(toLatLngLiteral(point)));
      map.fitBounds(bounds, 64);
      return;
    }

    if (originPlace || destinationPlace) {
      if (lastViewportKeyRef.current === nextViewportKey) {
        return;
      }

      lastViewportKeyRef.current = nextViewportKey;
      const bounds = new maps.LatLngBounds();

      if (originPlace) {
        bounds.extend(toLatLngLiteral(originPlace));
      }

      if (destinationPlace) {
        bounds.extend(toLatLngLiteral(destinationPlace));
      }

      map.fitBounds(bounds, 96);
      return;
    }

    if (lastViewportKeyRef.current === "route:empty") {
      return;
    }

    lastViewportKeyRef.current = "route:empty";
    map.setCenter(PUNE_CENTER);
    map.setZoom(12);
  }, [
    destinationPlace,
    generatedRoutePoints,
    isRouteLocked,
    originPlace,
    routeEditorMode,
    selectedWaypointId,
    waypoints,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;

    if (!map || !maps) {
      return;
    }

    if (!currentPosition) {
      currentMarkerRef.current?.setMap(null);
      currentMarkerRef.current = null;
      return;
    }

    const position = toLatLngLiteral(currentPosition);

    if (!currentMarkerRef.current) {
      currentMarkerRef.current = new maps.Marker({
        icon: {
          path: maps.SymbolPath.CIRCLE,
          fillColor: "#111827",
          fillOpacity: 1,
          scale: 7,
          strokeColor: "#22C55E",
          strokeWeight: 3,
        },
        map,
        position,
        title: "Current simulated device position",
      });
      return;
    }

    currentMarkerRef.current.setPosition(position);
  }, [currentPosition]);

  return (
    <section className="panel panel--map">
      <div className="panel__heading">
        <h2>{routeEditorMode === "manual" ? "Waypoint map" : "Route map"}</h2>
      </div>
      {error ? (
        <div className="map-error">
          <p>{error}</p>
          <ul className="map-checklist">
            <li>Maps JavaScript API enabled</li>
            <li>Places API (New) enabled</li>
            <li>Routes API enabled</li>
            <li>Billing enabled</li>
            <li>Referrer allows {`${getExpectedOrigin()}/*`}</li>
            <li>Key is present in simulator settings</li>
          </ul>
        </div>
      ) : null}
      <div className="map-canvas" ref={mapNodeRef} />
    </section>
  );
}
