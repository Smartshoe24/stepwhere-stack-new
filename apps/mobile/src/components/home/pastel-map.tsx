import type { ChildTrailResponseDto } from '@stepwhere/types';

import type MapViewType from 'react-native-maps';
import type { Region } from 'react-native-maps';
import type { SharedValue } from 'react-native-reanimated';
import React from 'react';
import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ChildMapMarker } from '@/components/home/child-map-marker';
import { MapControls } from '@/components/home/map-controls';
import { MovementTrail } from '@/components/home/movement-trail';
import { SafeZoneRings } from '@/components/home/safe-zone-rings';
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
  mapRef: React.RefObject<MapViewType | null>;
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

export function PastelMap({
  active,
  bottomInset,
  chromeHidden,
  controlsHidden,
  controlsTopOffset,
  floatingBottomOffset,
  geofenceButtonState,
  geofenceCenterLatitude: _geofenceCenterLatitude,
  geofenceCenterLongitude: _geofenceCenterLongitude,
  geofenceRadiusPending,
  geofenceLiveRadiusMeters: _geofenceLiveRadiusMeters,
  geofenceRadiusMeters,
  geofenceVisible,
  isFollowingChild,
  isFullscreen,
  onMapGestureComplete: _onMapGestureComplete,
  onMapGestureStart: _onMapGestureStart,
  onMapReady: _onMapReady,
  onMapPress,
  onMapTouchCancel: _onMapTouchCancel,
  onMapTouchEnd: _onMapTouchEnd,
  onMapTouchMove: _onMapTouchMove,
  onMapTouchStart: _onMapTouchStart,
  onSafetyPress,
  onSharePress,
  onTargetPress,
  selectedChild,
  trailLiveSamples,
  trail,
  shareDisabled = false,
  showLocation = true,
  showShareControl = true,
  themeTransitionActive: _themeTransitionActive,
  themeTransitionTargetTheme: _themeTransitionTargetTheme,
}: PastelMapProps) {
  return (
    <View style={styles.container}>
      <View style={styles.mapSurface}>
        <View style={styles.park} />
        <View style={styles.water} />
        <View style={styles.roadPrimaryOne} />
        <View style={styles.roadPrimaryTwo} />
        <View style={styles.roadMinorOne} />
        <View style={styles.roadMinorTwo} />
        <View style={styles.blockOne} />
        <View style={styles.blockTwo} />
        {active && showLocation && geofenceRadiusMeters != null ? (
          <SafeZoneRings
            pending={geofenceRadiusPending}
            radiusMeters={geofenceRadiusMeters}
            status={geofenceButtonState === 'breached' ? 'breached' : 'enabled'}
            visible={geofenceVisible}
          />
        ) : null}
        {HOME_PAST_LOCATION_DOTS_ENABLED && active && showLocation ? (
          <MovementTrail
            anchorCoordinate={{
              latitude: selectedChild.latitude,
              longitude: selectedChild.longitude,
            }}
            childId={selectedChild.id}
            liveCoordinate={{
              latitude: selectedChild.latitude,
              longitude: selectedChild.longitude,
            }}
            liveOccurredAt={selectedChild.lastSeenAt}
            liveSamples={trailLiveSamples}
            trail={trail}
          />
        ) : null}
        {showLocation ? <ChildMapMarker active={active} child={selectedChild} /> : null}
      </View>

      <Pressable
        accessibilityLabel={isFullscreen ? 'Exit fullscreen map' : 'Expand map'}
        accessibilityRole="button"
        onPress={onMapPress}
        style={styles.previewOverlay}
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

const styles = StyleSheet.create(theme => ({
  container: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: theme.colors.map,
  },
  mapSurface: {
    flex: 1,
    backgroundColor: theme.colors.map,
  },
  park: {
    position: 'absolute',
    top: '16%',
    left: '10%',
    width: 118,
    height: 82,
    borderRadius: 28,
    backgroundColor: 'rgba(220, 252, 231, 0.78)',
  },
  water: {
    position: 'absolute',
    right: '9%',
    top: '28%',
    width: 96,
    height: 74,
    borderRadius: 26,
    backgroundColor: 'rgba(224, 242, 254, 0.8)',
  },
  roadPrimaryOne: {
    position: 'absolute',
    top: '48%',
    left: '-8%',
    width: '118%',
    height: 22,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    transform: [{ rotate: '-12deg' }],
  },
  roadPrimaryTwo: {
    position: 'absolute',
    top: '31%',
    left: '18%',
    width: 22,
    height: '58%',
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    transform: [{ rotate: '6deg' }],
  },
  roadMinorOne: {
    position: 'absolute',
    top: '26%',
    left: '2%',
    width: '76%',
    height: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    transform: [{ rotate: '14deg' }],
  },
  roadMinorTwo: {
    position: 'absolute',
    bottom: '25%',
    right: '4%',
    width: '54%',
    height: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    transform: [{ rotate: '-18deg' }],
  },
  blockOne: {
    position: 'absolute',
    top: '18%',
    right: '22%',
    width: 72,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
  },
  blockTwo: {
    position: 'absolute',
    bottom: '18%',
    left: '14%',
    width: 84,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.52)',
  },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
}));
