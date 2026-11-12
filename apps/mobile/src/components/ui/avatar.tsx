import { Image } from 'expo-image';
import React from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

type AvatarProps = {
  backgroundColor: string;
  imageUrl?: string | null;
  initials: string;
  ringColor?: string;
  size: number;
  textSize?: number;
};

export function Avatar({ backgroundColor, imageUrl, initials, ringColor, size, textSize }: AvatarProps) {
  return (
    <View style={styles.outer(size, ringColor)}>
      <View style={styles.inner(size, backgroundColor)}>
        {imageUrl ? (
          <Image contentFit="cover" source={{ uri: imageUrl }} style={styles.image(size)} />
        ) : (
          <Text style={styles.label(textSize ?? size * 0.28)}>{initials}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create(theme => ({
  outer: (size: number, ringColor?: string) => ({
    width: size,
    height: size,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: ringColor ? 2.5 : 0,
    borderColor: ringColor ?? 'transparent',
  }),
  inner: (size: number, backgroundColor: string) => ({
    width: size - 6,
    height: size - 6,
    borderRadius: theme.radius.circle,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor,
  }),
  image: (size: number) => ({
    width: size - 6,
    height: size - 6,
    borderRadius: theme.radius.circle,
  }),
  label: (fontSize: number) => ({
    color: theme.colors.avatar.text,
    fontFamily: theme.typography.family.display,
    fontSize,
    fontWeight: theme.typography.weight.semibold,
    letterSpacing: 0,
  }),
}));
