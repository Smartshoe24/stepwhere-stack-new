import React, { useEffect, useId, useRef, useState } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import {
  SHOE_LOADER_PATH,
  SHOE_LOADER_VIEW_BOX,
} from "@/components/loading/shoe-loader-path";

type ShoeLoaderProps = {
  loopDurationMs?: number;
  size?: number;
};

const AnimatedPath = Animated.createAnimatedComponent(Path);
const VIEW_BOX_WIDTH = 1203;
const VIEW_BOX_HEIGHT = 575;
const STROKE_WIDTH = 16;

export function ShoeLoader({
  loopDurationMs = 1400,
  size = 86,
}: ShoeLoaderProps) {
  const { theme } = useUnistyles();
  const pathRef = useRef<Path | null>(null);
  const gradientId = useId().replace(/[:]/g, "");
  const [pathLength, setPathLength] = useState<number | null>(null);
  const progress = useSharedValue(0);
  const dashArray = pathLength ? [pathLength, pathLength] : undefined;
  const animatedProps = useAnimatedProps(() => {
    if (!pathLength) {
      return {
        strokeDashoffset: 0,
      };
    }

    const strokeDashoffset =
      progress.value <= 1
        ? interpolate(progress.value, [0, 1], [pathLength, 0])
        : interpolate(progress.value, [1, 2], [0, -pathLength]);

    return {
      strokeDashoffset,
    };
  });
  const width = size;
  const height = size * (VIEW_BOX_HEIGHT / VIEW_BOX_WIDTH);

  useEffect(() => {
    const startedAt = Date.now();
    const frameId = requestAnimationFrame(() => {
      const nextPathLength = pathRef.current?.getTotalLength?.();

      if (nextPathLength && Number.isFinite(nextPathLength)) {
        setPathLength(nextPathLength);

        if (__DEV__) {
          console.info("[loader] shoe path measured", {
            durationMs: Date.now() - startedAt,
            length: nextPathLength,
          });
        }
      }
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    if (!pathLength) {
      return;
    }

    progress.set(0);
    progress.set(
      withRepeat(
        withTiming(2, {
          duration: loopDurationMs,
          easing: Easing.linear,
        }),
        -1,
        false,
      ),
    );
  }, [loopDurationMs, pathLength, progress]);

  return (
    <View style={styles.container}>
      <Svg height={height} viewBox={SHOE_LOADER_VIEW_BOX} width={width}>
        <Defs>
          <LinearGradient
            id={gradientId}
            x1="60"
            x2="1168"
            y1="287"
            y2="287"
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor={theme.colors.loader.shoeTrailStart} />
            <Stop offset="1" stopColor={theme.colors.loader.shoeTrailEnd} />
          </LinearGradient>
        </Defs>

        <Path
          d={SHOE_LOADER_PATH}
          fill="none"
          ref={pathRef}
          stroke={theme.colors.loader.shoeBaseStroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={STROKE_WIDTH}
        />

        {dashArray ? (
          <AnimatedPath
            animatedProps={animatedProps}
            d={SHOE_LOADER_PATH}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeDasharray={dashArray}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={STROKE_WIDTH}
          />
        ) : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create(() => ({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
}));
