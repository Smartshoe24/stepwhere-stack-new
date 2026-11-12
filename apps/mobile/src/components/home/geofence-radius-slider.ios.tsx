import React from 'react';
import {
  type AccessibilityActionEvent,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  clamp,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import type { GeofenceRadiusSliderProps } from './geofence-radius-slider.types';

const THUMB_SIZE = 28;
const TRACK_HEIGHT = 4;

function radiusForPosition(
  positionX: number,
  width: number,
  minimumValue: number,
  maximumValue: number,
  step: number,
) {
  'worklet';

  const travel = Math.max(width - THUMB_SIZE, 1);
  const progress = clamp((positionX - THUMB_SIZE / 2) / travel, 0, 1);
  const rawValue = minimumValue + progress * (maximumValue - minimumValue);
  const steppedValue = Math.round(rawValue / Math.max(step, 1)) * Math.max(step, 1);

  return clamp(steppedValue, minimumValue, maximumValue);
}

function GeofenceRadiusSliderComponent({
  activeTrackColor,
  inactiveTrackColor,
  liveValue,
  maximumValue,
  minimumValue,
  onInteractionCancel,
  onInteractionEnd,
  onInteractionStart,
  onValueChange,
  step,
  style,
  thumbColor,
  value,
}: GeofenceRadiusSliderProps) {
  const width = useSharedValue(0);
  const callbacks = React.useMemo(() => ({
    cancel: onInteractionCancel,
    change: onValueChange,
    end: onInteractionEnd,
    start: onInteractionStart,
  }), [onInteractionCancel, onInteractionEnd, onInteractionStart, onValueChange]);
  const interactionFinished = React.useCallback((nextValue: number) => {
    callbacks.change(nextValue);
    callbacks.end();
  }, [callbacks]);
  const tapFinished = React.useCallback((nextValue: number) => {
    callbacks.start();
    callbacks.change(nextValue);
    callbacks.end();
  }, [callbacks]);

  React.useEffect(() => {
    liveValue.set(value);
  }, [liveValue, value]);

  const panGesture = React.useMemo(
    () => Gesture.Pan()
      .minDistance(0)
      .onBegin((event) => {
        liveValue.set(radiusForPosition(
          event.x,
          width.get(),
          minimumValue,
          maximumValue,
          step,
        ));
        runOnJS(onInteractionStart)();
      })
      .onUpdate((event) => {
        liveValue.set(radiusForPosition(
          event.x,
          width.get(),
          minimumValue,
          maximumValue,
          step,
        ));
      })
      .onEnd(() => {
        runOnJS(interactionFinished)(liveValue.get());
      })
      .onFinalize((_event, success) => {
        if (!success) {
          runOnJS(onInteractionCancel)();
        }
      }),
    [
      interactionFinished,
      liveValue,
      maximumValue,
      minimumValue,
      onInteractionCancel,
      onInteractionStart,
      step,
      width,
    ],
  );
  const tapGesture = React.useMemo(
    () => Gesture.Tap().onEnd((event, success) => {
      if (!success) {
        return;
      }

      const nextValue = radiusForPosition(
        event.x,
        width.get(),
        minimumValue,
        maximumValue,
        step,
      );
      liveValue.set(nextValue);
      runOnJS(tapFinished)(nextValue);
    }),
    [liveValue, maximumValue, minimumValue, step, tapFinished, width],
  );
  const gesture = React.useMemo(
    () => Gesture.Exclusive(panGesture, tapGesture),
    [panGesture, tapGesture],
  );
  const activeTrackStyle = useAnimatedStyle(() => {
    const progress = clamp(
      (liveValue.get() - minimumValue) / Math.max(maximumValue - minimumValue, 1),
      0,
      1,
    );

    return {
      transform: [{ scaleX: progress }],
      transformOrigin: 'left center',
    };
  }, [maximumValue, minimumValue]);
  const thumbStyle = useAnimatedStyle(() => {
    const progress = clamp(
      (liveValue.get() - minimumValue) / Math.max(maximumValue - minimumValue, 1),
      0,
      1,
    );

    return {
      transform: [{ translateX: progress * Math.max(width.get() - THUMB_SIZE, 0) }],
    };
  }, [maximumValue, minimumValue]);

  const handleLayout = React.useCallback((event: LayoutChangeEvent) => {
    width.set(event.nativeEvent.layout.width);
  }, [width]);
  const handleAccessibilityAction = React.useCallback((event: AccessibilityActionEvent) => {
    const direction = event.nativeEvent.actionName === 'increment'
      ? 1
      : event.nativeEvent.actionName === 'decrement'
        ? -1
        : 0;

    if (!direction) {
      return;
    }

    const nextValue = clamp(
      liveValue.get() + direction * step,
      minimumValue,
      maximumValue,
    );
    liveValue.set(nextValue);
    callbacks.start();
    callbacks.change(nextValue);
    callbacks.end();
  }, [callbacks, liveValue, maximumValue, minimumValue, step]);

  return (
    <GestureDetector gesture={gesture}>
      <View
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        accessibilityLabel="Geofence radius"
        accessibilityRole="adjustable"
        accessibilityValue={{ max: maximumValue, min: minimumValue, now: value }}
        onAccessibilityAction={handleAccessibilityAction}
        onLayout={handleLayout}
        style={[styles.container, style]}
      >
        <View
          pointerEvents="none"
          style={[
            styles.track,
            { backgroundColor: inactiveTrackColor },
          ]}
        >
          <Animated.View
            style={[
              styles.activeTrack,
              { backgroundColor: activeTrackColor },
              activeTrackStyle,
            ]}
          />
        </View>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            { backgroundColor: thumbColor },
            thumbStyle,
          ]}
        />
      </View>
    </GestureDetector>
  );
}

const styles = {
  container: {
    height: 44,
    justifyContent: 'center' as const,
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    overflow: 'hidden' as const,
    marginHorizontal: THUMB_SIZE / 2,
  },
  activeTrack: {
    ...({
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    } as const),
  },
  thumb: {
    position: 'absolute' as const,
    left: 0,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
  },
};

export const GeofenceRadiusSlider = React.memo(GeofenceRadiusSliderComponent);
