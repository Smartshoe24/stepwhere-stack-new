import type { ChildTrailResponseDto } from '@stepwhere/types';

import React, { RefObject } from 'react';
import { type GestureResponderEvent, type LayoutChangeEvent, View } from 'react-native';
import MapView, { type Region, PROVIDER_GOOGLE } from 'react-native-maps';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ChildMapMarker } from '@/components/home/child-map-marker.native';
import { MapControls } from '@/components/home/map-controls';
import { darkMapStyle, lightMapStyle } from '@/components/home/map-styles';
import { GeofenceRadiusRing } from '@/components/home/geofence-radius-ring';
import { MovementTrail } from '@/components/home/movement-trail.native';
import { SafetyFab } from '@/components/home/safety-fab';
import type { GeofenceUiStatus } from '@/components/home/geofence-state';
import {
  HOME_PAST_LOCATION_DOTS_ENABLED,
  type LiveTrailSample,
} from '@/components/home/movement-trail-geometry';
import type { OverviewChildCard } from '@/features/overview/overview-ui';

type PastelMapProps = {
  active: boolean;
  bottomInset: number;
  chromeHidden: boolean;
  controlsHidden: boolean;
  controlsTopOffset: number;
  floatingBottomOffset: number;
  geofenceButtonState: GeofenceUiStatus;
  geofenceCenterLatitude: number | null;
  geofenceCenterLongitude: number | null;
  geofenceRadiusPending: boolean;
  geofenceLiveRadiusMeters: SharedValue<number>;
  geofenceRadiusMeters: number | null;
  geofenceVisible: boolean;
  initialRegion: Region;
  isFollowingChild: boolean;
  isFullscreen: boolean;
  mapRef: RefObject<MapView | null>;
  onMapGestureComplete: () => void;
  onMapGestureStart: (isUserGesture?: boolean) => void;
  onMapReady: () => void;
  onMapPress: () => void;
  onMapTouchCancel: () => void;
  onMapTouchEnd: (activeTouchCount: number) => void;
  onMapTouchMove: (activeTouchCount: number) => void;
  onMapTouchStart: (activeTouchCount: number) => void;
  onSafetyPress: () => void;
  onSharePress: () => void;
  onTargetPress: () => void;
  selectedChild: OverviewChildCard;
  trailLiveSamples?: LiveTrailSample[];
  trail: ChildTrailResponseDto | null;
  shareDisabled?: boolean;
  showLocation?: boolean;
  showShareControl?: boolean;
  themeTransitionActive?: boolean;
  themeTransitionTargetTheme?: 'dark' | 'light' | null;
};

function PastelMapComponent({
  active,
  bottomInset,
  chromeHidden,
  controlsHidden,
  controlsTopOffset,
  floatingBottomOffset,
  geofenceButtonState,
  geofenceCenterLatitude,
  geofenceCenterLongitude,
  geofenceRadiusPending,
  geofenceLiveRadiusMeters,
  geofenceRadiusMeters,
  geofenceVisible,
  initialRegion,
  isFollowingChild,
  isFullscreen,
  mapRef,
  onMapGestureComplete,
  onMapGestureStart,
  onMapReady,
  onMapPress,
  onMapTouchCancel,
  onMapTouchEnd,
  onMapTouchMove,
  onMapTouchStart,
  onSafetyPress,
  onSharePress,
  onTargetPress,
  selectedChild,
  trailLiveSamples,
  trail,
  shareDisabled = false,
  showLocation = true,
  showShareControl = true,
  themeTransitionActive = false,
  themeTransitionTargetTheme,
}: PastelMapProps) {
  const { rt } = useUnistyles();
  const resolvedMapStyle = rt.themeName === 'dark' ? darkMapStyle : lightMapStyle;
  const mapTransitionScrimStyle = useAnimatedStyle(() => ({
    opacity: withTiming(themeTransitionActive ? 1 : 0, {
      duration: themeTransitionActive ? 80 : 180,
    }),
  }), [themeTransitionActive]);
  const scrimColor = themeTransitionTargetTheme === 'dark'
    ? 'rgba(15, 23, 32, 0.24)'
    : 'rgba(247, 248, 250, 0.22)';
  const layoutHeight = useSharedValue(0);
  const layoutWidth = useSharedValue(0);
  const regionLatitude = useSharedValue(initialRegion.latitude);
  const regionLatitudeDelta = useSharedValue(initialRegion.latitudeDelta);
  const regionLongitude = useSharedValue(initialRegion.longitude);
  const regionLongitudeDelta = useSharedValue(initialRegion.longitudeDelta);
  const [viewportReady, setViewportReady] = React.useState(false);
  const [mapReady, setMapReady] = React.useState(false);
  const geofenceRingVisible = Boolean(
    viewportReady
    && active
    && showLocation
    && geofenceVisible
    && geofenceRadiusMeters != null
    && geofenceCenterLatitude != null
    && geofenceCenterLongitude != null,
  );
  const geofenceRingVisibleRef = React.useRef(geofenceRingVisible);

  React.useLayoutEffect(() => {
    geofenceRingVisibleRef.current = geofenceRingVisible;
  }, [geofenceRingVisible]);

  const handleLayout = React.useCallback((event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;

    layoutHeight.set(Math.round(height));
    layoutWidth.set(Math.round(width));
    setViewportReady(current => current || (height > 0 && width > 0));
  }, [layoutHeight, layoutWidth]);

  const syncRegionSharedValues = React.useCallback((nextRegion: Region) => {
    regionLatitude.set(nextRegion.latitude);
    regionLatitudeDelta.set(nextRegion.latitudeDelta);
    regionLongitude.set(nextRegion.longitude);
    regionLongitudeDelta.set(nextRegion.longitudeDelta);
  }, [
    regionLatitude,
    regionLatitudeDelta,
    regionLongitude,
    regionLongitudeDelta,
  ]);

  // Hoisted out of JSX: inline arrows gave the native MapView six new prop
  // identities per render, which react-native-maps forwards across the bridge.
  const handlePanDrag = React.useCallback(() => {
    onMapGestureStart(true);
  }, [onMapGestureStart]);
  const handleMapReady = React.useCallback(() => {
    setMapReady(true);
    onMapReady();
  }, [onMapReady]);
  const handleTouchEnd = React.useCallback((event: GestureResponderEvent) => {
    onMapTouchEnd(event.nativeEvent.touches.length);
  }, [onMapTouchEnd]);
  const handleTouchMove = React.useCallback((event: GestureResponderEvent) => {
    onMapTouchMove(event.nativeEvent.touches.length);
  }, [onMapTouchMove]);
  const handleTouchStart = React.useCallback((event: GestureResponderEvent) => {
    onMapTouchStart(event.nativeEvent.touches.length);
  }, [onMapTouchStart]);
  const handleRegionChangeComplete = React.useCallback((
    nextRegion: Region,
    details?: { isGesture?: boolean },
  ) => {
    syncRegionSharedValues(nextRegion);

    if (details?.isGesture) {
      onMapGestureComplete();
    }
  }, [onMapGestureComplete, syncRegionSharedValues]);
  const handleRegionChange = React.useCallback((nextRegion: Region) => {
    if (geofenceRingVisibleRef.current) {
      syncRegionSharedValues(nextRegion);
    }
  }, [syncRegionSharedValues]);
  const handleRegionChangeStart = React.useCallback((
    _region: Region,
    details?: { isGesture?: boolean },
  ) => {
    if (details?.isGesture) {
      onMapGestureStart(true);
    }
  }, [onMapGestureStart]);

  return (
    <View onLayout={handleLayout} style={styles.container}>
      <MapView
        customMapStyle={resolvedMapStyle}
        ref={mapRef}
        initialRegion={initialRegion}
        mapType="standard"
        onMapReady={handleMapReady}
        onPanDrag={handlePanDrag}
        onPress={onMapPress}
        onRegionChange={handleRegionChange}
        onTouchCancel={onMapTouchCancel}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onTouchStart={handleTouchStart}
        onRegionChangeComplete={handleRegionChangeComplete}
        onRegionChangeStart={handleRegionChangeStart}
        pitchEnabled={false}
        provider={PROVIDER_GOOGLE}
        rotateEnabled={false}
        scrollEnabled
        showsBuildings
        showsCompass={false}
        showsIndoorLevelPicker={false}
        showsScale={false}
        showsTraffic={false}
        toolbarEnabled={false}
        zoomEnabled
        style={styles.map}>
        {HOME_PAST_LOCATION_DOTS_ENABLED && active && showLocation ? (
          <MovementTrail
            childId={selectedChild.id}
            liveLatitude={selectedChild.latitude}
            liveLongitude={selectedChild.longitude}
            liveOccurredAt={selectedChild.lastSeenAt}
            liveSamples={trailLiveSamples}
            trail={trail}
          />
        ) : null}
        {showLocation ? (
          <ChildMapMarker
            active={active}
            child={selectedChild}
            mapReady={mapReady}
          />
        ) : null}
      </MapView>

      {geofenceCenterLatitude != null && geofenceCenterLongitude != null ? (
        <GeofenceRadiusRing
          centerLatitude={geofenceCenterLatitude}
          centerLongitude={geofenceCenterLongitude}
          key={selectedChild.id}
          layoutHeight={layoutHeight}
          layoutWidth={layoutWidth}
          pending={geofenceRadiusPending}
          radiusMeters={geofenceLiveRadiusMeters}
          regionLatitude={regionLatitude}
          regionLatitudeDelta={regionLatitudeDelta}
          regionLongitude={regionLongitude}
          regionLongitudeDelta={regionLongitudeDelta}
          status={geofenceButtonState === 'breached' ? 'breached' : 'enabled'}
          visible={geofenceRingVisible}
        />
      ) : null}

      <Animated.View
        pointerEvents="none"
        style={[
          styles.transitionScrim(scrimColor),
          mapTransitionScrimStyle,
        ]}
      />

      {showLocation ? <MapControls
        hidden={controlsHidden}
        isFollowingChild={isFollowingChild}
        isFullscreen={isFullscreen}
        onSharePress={onSharePress}
        onTargetPress={onTargetPress}
        shareDisabled={shareDisabled}
        showShareControl={showShareControl}
        topOffset={controlsTopOffset}
      /> : null}
      {showLocation ? <SafetyFab
        bottomOffset={isFullscreen ? Math.max(bottomInset, 12) + 20 : floatingBottomOffset}
        chromeHidden={controlsHidden}
        onPress={onSafetyPress}
        state={geofenceButtonState}
      /> : null}
    </View>
  );
}

export const PastelMap = React.memo(PastelMapComponent);

const styles = StyleSheet.create(theme => ({
  container: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: theme.colors.map,
  },
  map: {
    flex: 1,
  },
  transitionScrim: (backgroundColor: string) => ({
    ...StyleSheet.absoluteFillObject,
    backgroundColor,
  }),
}));
