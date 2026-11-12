import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Marker } from 'react-native-maps';
import { useUnistyles } from 'react-native-unistyles';

import { AvatarPin } from '@/components/ui/avatar-pin';
import type { OverviewChildCard } from '@/features/overview/overview-ui';

type ChildMapMarkerProps = {
  active: boolean;
  child: OverviewChildCard;
  mapReady: boolean;
};

function nowMs() {
  return typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now();
}

function ChildMapMarkerComponent({ active, child, mapReady }: ChildMapMarkerProps) {
  const { theme } = useUnistyles();
  const trackingKey = useMemo(() => [
    child.avatarTone,
    child.avatarUrl ?? '',
    child.id,
    child.initials,
    child.status,
  ].join(':'), [child.avatarTone, child.avatarUrl, child.id, child.initials, child.status]);
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstSettleFrameRef = useRef<number | null>(null);
  const secondSettleFrameRef = useRef<number | null>(null);
  const trackingStartedAtRef = useRef<number | null>(null);
  const previousTrackingKeyRef = useRef(trackingKey);
  const previousAvatarUrlRef = useRef(child.avatarUrl);
  const [hasLaidOut, setHasLaidOut] = useState(false);
  const [readyAvatarUrl, setReadyAvatarUrl] = useState<string | null>(() => (
    child.avatarUrl ? null : ''
  ));
  const [settledTrackingKey, setSettledTrackingKey] = useState<string | null>(null);
  const contentReady = child.avatarUrl
    ? readyAvatarUrl === child.avatarUrl
    : true;
  const tracksViewChanges = active && settledTrackingKey !== trackingKey;

  useEffect(() => {
    if (previousTrackingKeyRef.current !== trackingKey) {
      previousTrackingKeyRef.current = trackingKey;
      setSettledTrackingKey(null);
    }
  }, [trackingKey]);

  useEffect(() => {
    if (previousAvatarUrlRef.current !== child.avatarUrl) {
      previousAvatarUrlRef.current = child.avatarUrl;
      setReadyAvatarUrl(child.avatarUrl ? null : '');
    }
  }, [child.avatarUrl]);

  useEffect(() => {
    if (firstSettleFrameRef.current != null) {
      cancelAnimationFrame(firstSettleFrameRef.current);
      firstSettleFrameRef.current = null;
    }

    if (secondSettleFrameRef.current != null) {
      cancelAnimationFrame(secondSettleFrameRef.current);
      secondSettleFrameRef.current = null;
    }

    if (settleTimeoutRef.current) {
      clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    }

    if (
      !active
      || !mapReady
      || !hasLaidOut
      || !contentReady
      || settledTrackingKey === trackingKey
    ) {
      return;
    }

    firstSettleFrameRef.current = requestAnimationFrame(() => {
      firstSettleFrameRef.current = null;
      secondSettleFrameRef.current = requestAnimationFrame(() => {
        secondSettleFrameRef.current = null;
        settleTimeoutRef.current = setTimeout(() => {
          setSettledTrackingKey(trackingKey);
          settleTimeoutRef.current = null;
        }, 250);
      });
    });

    return () => {
      if (firstSettleFrameRef.current != null) {
        cancelAnimationFrame(firstSettleFrameRef.current);
        firstSettleFrameRef.current = null;
      }

      if (secondSettleFrameRef.current != null) {
        cancelAnimationFrame(secondSettleFrameRef.current);
        secondSettleFrameRef.current = null;
      }

      if (settleTimeoutRef.current) {
        clearTimeout(settleTimeoutRef.current);
        settleTimeoutRef.current = null;
      }

    };
  }, [active, contentReady, hasLaidOut, mapReady, settledTrackingKey, trackingKey]);

  useEffect(() => {
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }

    if (!active || settledTrackingKey === trackingKey) {
      return;
    }

    safetyTimeoutRef.current = setTimeout(() => {
      setSettledTrackingKey(trackingKey);
      safetyTimeoutRef.current = null;
    }, 1500);

    return () => {
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
    };
  }, [active, settledTrackingKey, trackingKey]);

  useEffect(() => {
    if (tracksViewChanges) {
      if (trackingStartedAtRef.current == null) {
        trackingStartedAtRef.current = nowMs();

        if (__DEV__) {
          console.info('[home-perf] marker tracking enabled', {
            childId: child.id,
          });
        }
      }

      return;
    }

    if (trackingStartedAtRef.current != null) {
      if (__DEV__) {
        console.info('[home-perf] marker tracking disabled', {
          childId: child.id,
          durationMs: Math.round(nowMs() - trackingStartedAtRef.current),
        });
      }

      trackingStartedAtRef.current = null;
    }
  }, [child.id, tracksViewChanges]);

  return (
    <Marker
      anchor={{ x: 0.5, y: 0.88 }}
      coordinate={{ latitude: child.latitude, longitude: child.longitude }}
      key={`${child.id}-${child.status}`}
      tracksViewChanges={tracksViewChanges}>
      <AvatarPin
        backgroundColor={theme.colors.avatar.tones[child.avatarTone]}
        imageUrl={child.avatarUrl}
        initials={child.initials}
        onImageError={() => {
          setReadyAvatarUrl(child.avatarUrl ?? '');
        }}
        onImageLoad={() => {
          setReadyAvatarUrl(child.avatarUrl ?? '');
        }}
        onLayout={(event) => {
          const { height, width } = event.nativeEvent.layout;
          if (Math.round(width) >= 64 && Math.round(height) >= 78) {
            setHasLaidOut(true);
          }
        }}
        ringColor={theme.status[child.status].border}
      />
    </Marker>
  );
}

export const ChildMapMarker = React.memo(ChildMapMarkerComponent);
