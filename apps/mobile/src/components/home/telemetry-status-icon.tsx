import React from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AppIcon } from '@/components/ui/app-icon';
import type { TelemetryStatusSymbol } from '@/features/overview/telemetry-presentation';

type TelemetryStatusIconProps = {
  color: string;
  size?: number;
  symbol: TelemetryStatusSymbol;
};

const INNER_ICON = {
  check: { name: 'check' as const, size: 13 },
  cross: { name: 'close' as const, size: 13 },
  exclamation: { name: 'exclamation' as const, size: 12 },
  moon: { name: 'moon' as const, size: 12 },
} as const;

/** Tones arrive as resolved hex strings from `theme.telemetry.*`. */
function withAlpha(hexColor: string, alpha: number) {
  const normalized = hexColor.replace('#', '');
  const expanded = normalized.length === 3
    ? normalized.split('').map(value => `${value}${value}`).join('')
    : normalized;

  if (expanded.length !== 6) {
    return hexColor;
  }

  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/**
 * Soft filled chip rather than a ring. The previous 22px circle used a 2px border
 * — 9% of its diameter — which read as far heavier than any other border in the
 * app and dwarfed the 12px glyph inside it.
 */
export function TelemetryStatusIcon({
  color,
  size = 22,
  symbol,
}: TelemetryStatusIconProps) {
  const inner = INNER_ICON[symbol];

  return (
    <View style={styles.chip(color, size)}>
      <AppIcon color={color} name={inner.name} size={inner.size} />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: (color: string, size: number) => ({
    width: size,
    height: size,
    borderRadius: size / 2,
    // 22% alpha of the tone: enough to read as a chip at 22px without competing
    // with the glyph.
    backgroundColor: withAlpha(color, 0.22),
    alignItems: 'center',
    justifyContent: 'center',
  }),
});
