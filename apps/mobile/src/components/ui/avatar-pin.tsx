import { Image } from 'expo-image';
import React, { useState } from 'react';
import { type LayoutChangeEvent, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

type AvatarPinProps = {
  backgroundColor: string;
  imageUrl?: string | null;
  initials: string;
  onImageError?: () => void;
  onImageLoad?: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  ringColor: string;
};

export function AvatarPin({
  backgroundColor,
  imageUrl,
  initials,
  onImageError,
  onImageLoad,
  onLayout,
  ringColor,
}: AvatarPinProps) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const resolvedImageUrl = imageUrl ?? undefined;
  const shouldRenderImage = Boolean(resolvedImageUrl && resolvedImageUrl !== failedImageUrl);

  return (
    <View onLayout={onLayout} style={styles.container}>
      <View style={styles.tail(ringColor)} />
      <View style={styles.body(ringColor)}>
        <View style={styles.innerBody}>
          <View style={styles.avatar(backgroundColor)}>
            {shouldRenderImage ? (
              <Image
                cachePolicy="memory-disk"
                contentFit="cover"
                onError={() => {
                  setFailedImageUrl(resolvedImageUrl ?? null);
                  onImageError?.();
                }}
                onLoad={() => {
                  onImageLoad?.();
                }}
                source={resolvedImageUrl ? { uri: resolvedImageUrl } : undefined}
                style={styles.avatarImage}
              />
            ) : (
              <Text style={styles.label}>{initials}</Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create(theme => ({
  container: {
    width: 64,
    height: 78,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  body: (ringColor: string) => ({
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ringColor,
    ...theme.shadows.marker,
  }),
  innerBody: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  avatar: (backgroundColor: string) => ({
    width: 32,
    height: 32,
    borderRadius: theme.radius.circle,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor,
  }),
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: theme.radius.circle,
  },
  label: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: theme.typography.weight.semibold,
  },
  tail: (ringColor: string) => ({
    position: 'absolute',
    top: 34,
    width: 18,
    height: 18,
    borderRadius: 5,
    backgroundColor: ringColor,
    transform: [{ rotate: '45deg' }],
  }),
}));
