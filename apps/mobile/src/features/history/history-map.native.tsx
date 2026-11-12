import type { ChildHistoryEventDto, HistoryCoordinateDto } from '@stepwhere/types';

import React from 'react';
import { Text, View } from 'react-native';
import MapView, { Circle, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { darkMapStyle, lightMapStyle } from '@/components/home/map-styles';
import { AppIcon } from '@/components/ui/app-icon';

import {
  getCameraPadding,
  getDayCoordinates,
  getEventCoordinates,
  getInitialRegion,
} from './history-camera';
import {
  buildStayNumbers,
  getHistoryEventColor,
  getHistoryEventIcon,
} from './history-event-visuals';

type HistoryMapProps = {
  bottomOverlayHeight: number;
  events: ChildHistoryEventDto[];
  interactive?: boolean;
  onMapPress: () => void;
  onSelectEvent: (event: ChildHistoryEventDto) => void;
  selectedEventId: string | null;
};

export function HistoryMap({
  bottomOverlayHeight,
  events,
  interactive = true,
  onMapPress,
  onSelectEvent,
  selectedEventId,
}: HistoryMapProps) {
  const { rt, theme } = useUnistyles();
  const mapRef = React.useRef<MapView | null>(null);
  const [mapReady, setMapReady] = React.useState(false);
  const selectedEvent = events.find(event => event.id === selectedEventId) ?? null;
  const initialRegion = React.useMemo(() => getInitialRegion(events), [events]);
  const stayNumbers = React.useMemo(() => buildStayNumbers(events), [events]);

  React.useEffect(() => {
    if (!mapReady) {
      return;
    }

    const coordinates = selectedEvent ? getEventCoordinates(selectedEvent) : getDayCoordinates(events);

    if (coordinates.length >= 2) {
      mapRef.current?.fitToCoordinates(coordinates, {
        animated: true,
        edgePadding: getCameraPadding(bottomOverlayHeight),
      });
      return;
    }

    const coordinate = coordinates[0];

    if (coordinate) {
      mapRef.current?.animateToRegion({
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        latitudeDelta: selectedEvent?.kind === 'stay' ? 0.002 : 0.01,
        longitudeDelta: selectedEvent?.kind === 'stay' ? 0.002 : 0.01,
      }, 350);
    }
  }, [bottomOverlayHeight, events, mapReady, selectedEvent]);

  return (
    <View style={styles.container}>
      <MapView
        customMapStyle={rt.themeName === 'dark' ? darkMapStyle : lightMapStyle}
        initialRegion={initialRegion}
        mapType="standard"
        onPress={onMapPress}
        onMapReady={() => setMapReady(true)}
        pitchEnabled={false}
        provider={PROVIDER_GOOGLE}
        ref={mapRef}
        rotateEnabled={false}
        scrollEnabled={interactive}
        showsCompass={false}
        showsIndoorLevelPicker={false}
        showsScale={false}
        showsTraffic={false}
        style={styles.map}
        toolbarEnabled={false}
        zoomEnabled={interactive}>
        {events.map(event => renderEventMapContent({
          event,
          onSelectEvent,
          selected: event.id === selectedEventId,
          stayNumber: stayNumbers.get(event.id) ?? null,
          theme,
        }))}
      </MapView>

      {/*
        Dimming happens once, as a scrim over the whole map, instead of setting
        opacity on every individual marker and polyline.
      */}
      {selectedEventId ? (
        <View pointerEvents="none" style={styles.scrim} />
      ) : null}

      <View pointerEvents="none" style={styles.attribution}>
        <Text style={styles.attributionText}>Map data © Google</Text>
      </View>
    </View>
  );
}

function renderEventMapContent(input: {
  event: ChildHistoryEventDto;
  selected: boolean;
  stayNumber: number | null;
  onSelectEvent: (event: ChildHistoryEventDto) => void;
  theme: ReturnType<typeof useUnistyles>['theme'];
}) {
  const color = getHistoryEventColor(input.theme, input.event.kind, input.selected);

  if (input.event.kind === 'stay') {
    const coordinate = input.event.place.representativeCoordinate;

    if (!coordinate) {
      return null;
    }

    return (
      <React.Fragment key={input.event.id}>
        {input.selected ? (
          <Circle
            center={coordinate}
            fillColor={`${color}22`}
            radius={input.event.radiusMeters}
            strokeColor={color}
            strokeWidth={2}
          />
        ) : null}
        <Marker
          coordinate={coordinate}
          onPress={pressEvent => {
            pressEvent.stopPropagation();
            input.onSelectEvent(input.event);
          }}
          zIndex={input.selected ? 20 : 5}>
          <View style={styles.pinWrap(input.selected)}>
            <View style={[styles.pin, { backgroundColor: color }]}>
              <AppIcon color="#FFFFFF" name={getHistoryEventIcon(input.event)} size={14} />
            </View>
            {input.stayNumber !== null ? (
              <View style={styles.pinNumber}>
                <Text style={styles.pinNumberText}>{input.stayNumber}</Text>
              </View>
            ) : null}
          </View>
        </Marker>
      </React.Fragment>
    );
  }

  if (input.event.kind === 'trip') {
    return input.event.geometry.segments.map((segment, segmentIndex) => (
      <Polyline
        coordinates={segment.map(toLatLng)}
        key={`${input.event.id}-${segmentIndex}`}
        lineCap="round"
        onPress={pressEvent => {
          pressEvent.stopPropagation();
          input.onSelectEvent(input.event);
        }}
        strokeColor={color}
        strokeWidth={input.selected ? 7 : 4}
        tappable
        zIndex={input.selected ? 10 : 1}
      />
    ));
  }

  const endpoints = [input.event.beforeCoordinate, input.event.afterCoordinate]
    .filter(Boolean) as HistoryCoordinateDto[];

  return endpoints.map((coordinate, endpointIndex) => (
    <Marker
      coordinate={coordinate}
      key={`${input.event.id}-${endpointIndex}`}
      onPress={pressEvent => {
        pressEvent.stopPropagation();
        input.onSelectEvent(input.event);
      }}>
      <View style={[styles.gapMarker, { borderColor: color }]} />
    </Marker>
  ));
}

function toLatLng(coordinate: HistoryCoordinateDto) {
  return {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
  };
}

const styles = StyleSheet.create(theme => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.map,
  },
  map: {
    flex: 1,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.history.mapScrim,
  },
  attribution: {
    position: 'absolute',
    bottom: theme.spacing[2],
    left: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.mapHeader,
  },
  attributionText: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.overline,
    letterSpacing: 0,
  },
  pinWrap: (selected: boolean) => ({
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ scale: selected ? 1.2 : 1 }],
  }),
  pin: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: theme.colors.surface,
    ...theme.shadows.marker,
  },
  pinNumber: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    minWidth: 15,
    height: 15,
    paddingHorizontal: 3,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
  },
  pinNumberText: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: theme.typography.weight.bold,
    ...theme.typography.tabular,
  },
  gapMarker: {
    width: 18,
    height: 18,
    borderRadius: theme.radius.circle,
    borderWidth: 3,
    backgroundColor: theme.colors.surface,
  },
}));
