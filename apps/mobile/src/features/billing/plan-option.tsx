import type { BillingPriceDto, BillingTermMonths } from '@stepwhere/types';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { formatPerMonth, formatRupees, formatTerm, getTermSavingPercent } from './billing-format';
import { BillingChip, RadioDot } from './billing-ui';

/** Billing period choices from the server's price book, shortest first. */
export function sortPrices(prices: BillingPriceDto[]) {
  return [...prices].sort((left, right) => left.termMonths - right.termMonths);
}

/** The middle term (the one with a saving) unless there are fewer than three. */
export function getDefaultTerm(prices: BillingPriceDto[]): BillingTermMonths | null {
  const sorted = sortPrices(prices);
  return (sorted.length >= 3 ? sorted[1] : sorted[sorted.length - 1])?.termMonths ?? null;
}

export function PlanOption({
  caption,
  onPress,
  price,
  prices,
  selected,
  shoeCount,
}: {
  caption?: string;
  onPress: () => void;
  price: BillingPriceDto;
  prices: BillingPriceDto[];
  selected: boolean;
  shoeCount: number;
}) {
  const sorted = sortPrices(prices);
  const isLongest = sorted.length > 1 && sorted[sorted.length - 1]?.termMonths === price.termMonths;
  const saving = getTermSavingPercent(prices, price.termMonths);
  const totalMinor = price.perShoeMinor * Math.max(shoeCount, 1);

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.option(selected), pressed && styles.pressed]}
    >
      <RadioDot selected={selected} />
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{formatTerm(price.termMonths)}</Text>
          {isLongest
            ? <BillingChip label="Best value" tone="amber" />
            : saving
              ? <BillingChip label={`Save ${saving}%`} tone="green" />
              : null}
        </View>
        <Text style={styles.subtitle}>{caption ?? formatPerMonth(totalMinor, price.termMonths)}</Text>
      </View>
      <Text style={styles.price}>{formatRupees(totalMinor)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create(theme => ({
  option: (selected: boolean) => ({
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    marginTop: theme.spacing[2],
    marginHorizontal: theme.spacing[4],
    paddingHorizontal: selected ? 13 : 14,
    paddingVertical: selected ? 9 : 10,
    borderRadius: theme.radius.button,
    borderWidth: selected ? 2 : 1,
    borderColor: selected ? theme.colors.primaryGreen : theme.colors.chrome.cardBorder,
    backgroundColor: selected ? theme.colors.safeZone : theme.colors.surface,
  }),
  copy: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.body,
    fontSize: 14,
    fontWeight: theme.typography.weight.semibold,
  },
  subtitle: {
    marginTop: 1,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
    ...theme.typography.tabular,
  },
  price: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    ...theme.typography.text.bodyLarge,
    ...theme.typography.tabular,
    fontWeight: theme.typography.weight.bold,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
