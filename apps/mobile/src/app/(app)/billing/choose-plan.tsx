import type { BillingTermMonths, CreateBillingQuoteInput } from '@stepwhere/types';
import { useRouter } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { BillingErrorCode, describeBillingError, hasErrorCode } from '@/features/billing/billing-errors';
import { formatRupees, formatShoeCount, formatTerm } from '@/features/billing/billing-format';
import { describeFirstChargeFinePrint } from '@/features/billing/billing-quote';
import { billingRoutes } from '@/features/billing/billing-routes';
import { describeDeviceStatus, getDefaultPlanSelection } from '@/features/billing/billing-state';
import {
  BillingButton,
  BillingLoadState,
  BillingNoticeBanner,
  BillingScreen,
  BillingText,
  FinePrint,
  SectionLabel,
} from '@/features/billing/billing-ui';
import { BillingLegalLinks } from '@/features/billing/legal-links';
import { getDefaultTerm, PlanOption, sortPrices } from '@/features/billing/plan-option';
import { ShoeTile } from '@/features/billing/shoe-tile';
import { useBilling } from '@/features/billing/use-billing';
import { useRequoteOnExpiry } from '@/features/billing/use-requote-on-expiry';
import { useBillingQuoteQuery } from '@/query/hooks';

export default function ChoosePlanScreen() {
  const router = useRouter();
  const billing = useBilling();
  const overview = billing.overview;
  const [pickedDeviceIds, setPickedDeviceIds] = React.useState<string[] | null>(null);
  const [pickedTerm, setPickedTerm] = React.useState<BillingTermMonths | null>(null);
  const [limitHit, setLimitHit] = React.useState(false);

  const prices = overview ? sortPrices(overview.prices.prices) : [];
  const maxShoes = overview?.prices.maxShoes ?? 0;
  const selection = pickedDeviceIds ?? (overview ? getDefaultPlanSelection(overview) : []);
  const termMonths = pickedTerm ?? getDefaultTerm(prices);
  const selectedPrice = prices.find(price => price.termMonths === termMonths) ?? null;
  const hasLivePlan = Boolean(overview?.subscription && overview.subscription.state !== 'expired' && overview.subscription.state !== 'revoked');
  const quoteInput: CreateBillingQuoteInput | null = overview && termMonths && selection.length > 0 && !hasLivePlan
    ? { kind: 'new_plan', deviceIds: selection, termMonths }
    : null;
  const quoteQuery = useBillingQuoteQuery(billing.organizationId, quoteInput);
  const quote = quoteQuery.isPlaceholderData ? undefined : quoteQuery.data;
  useRequoteOnExpiry(quote, quoteQuery.refetch);

  // Linked shoes first, then spares; a spare is listed but not preselected.
  const shoes = [...billing.shoes].sort((left, right) => Number(Boolean(right.child)) - Number(Boolean(left.child)));
  const totalMinor = selectedPrice ? selectedPrice.perShoeMinor * selection.length : 0;
  const quoteError = quoteQuery.error;
  const planExists = hasLivePlan || hasErrorCode(quoteError, BillingErrorCode.planExists);

  function toggle(deviceId: string) {
    if (selection.includes(deviceId)) {
      setLimitHit(false);
      setPickedDeviceIds(selection.filter(id => id !== deviceId));
      return;
    }

    if (selection.length >= maxShoes) {
      setLimitHit(true);
      return;
    }

    setLimitHit(false);
    setPickedDeviceIds([...selection, deviceId]);
  }

  if (!overview) {
    return (
      <BillingScreen title="Choose a plan">
        <BillingLoadState error={billing.billingQuery.error} onRetry={() => void billing.billingQuery.refetch()} />
      </BillingScreen>
    );
  }

  const footer = (
    <>
      <View style={styles.summaryRow}>
        <View style={styles.flex}>
          <Text style={styles.summaryTitle}>
            {selection.length > 0 && termMonths
              ? `${formatShoeCount(selection.length)} · ${formatTerm(termMonths)}`
              : 'Pick at least one shoe'}
          </Text>
          {selection.length > 0 ? (
            <BillingText variant="meta">
              {quote?.coverageStartsNow ? 'Tracking starts as soon as autopay is set up' : 'Nothing to pay today'}
            </BillingText>
          ) : null}
        </View>
        {selection.length > 0 && termMonths ? (
          <View style={styles.priceBlock}>
            <Text style={styles.total}>{formatRupees(quote?.renewalAmountMinor ?? totalMinor)}</Text>
            <BillingText variant="caption">{`every ${formatTerm(termMonths)}`}</BillingText>
          </View>
        ) : null}
      </View>
      <BillingButton
        busy={quoteQuery.isFetching && !quote}
        disabled={!quote || planExists || !overview.purchasesEnabled}
        label="Continue"
        onPress={() => {
          if (quote && termMonths) {
            router.push(billingRoutes.review(selection, termMonths));
          }
        }}
      />
      {quote ? (
        <FinePrint segments={describeFirstChargeFinePrint(quote, { devices: overview.devices, nameForDevice: billing.nameForDevice })} />
      ) : null}
      <BillingLegalLinks />
    </>
  );

  return (
    <BillingScreen footer={footer} title="Choose a plan">
      <BillingText align="center" style={styles.intro} variant="meta">
        Live location, history, trails, safe zones and sharing for every shoe on the plan.
      </BillingText>

      {planExists ? (
        <BillingNoticeBanner
          notice={{
            title: 'Your family already has a plan',
            body: 'Add shoes or change it from Subscription.',
            icon: 'family',
            tone: 'neutral',
            actionLabel: 'See plan',
          }}
          onAction={() => router.replace(billingRoutes.subscription())}
          style={styles.notice}
        />
      ) : quoteError ? (
        <BillingNoticeBanner
          notice={describeBillingError(quoteError)}
          onAction={() => void quoteQuery.refetch()}
          style={styles.notice}
        />
      ) : !overview.purchasesEnabled ? (
        <BillingNoticeBanner notice={describeBillingError({ code: BillingErrorCode.disabled })} style={styles.notice} />
      ) : null}

      <SectionLabel>{`Shoes · ${selection.length} of ${shoes.length} selected`}</SectionLabel>
      <View style={styles.tiles}>
        {shoes.map((shoe) => {
          const selected = selection.includes(shoe.deviceId);
          return (
            <ShoeTile
              dim={!shoe.child && !selected}
              key={shoe.deviceId}
              onPress={() => toggle(shoe.deviceId)}
              selected={selected}
              shoe={shoe}
              subtitle={describeDeviceStatus(shoe.device)}
            />
          );
        })}
      </View>
      {limitHit ? (
        <BillingText style={styles.limit} variant="caption">{`A plan covers up to ${maxShoes} shoes.`}</BillingText>
      ) : null}

      <SectionLabel>Billing period</SectionLabel>
      {prices.map(price => (
        <PlanOption
          key={price.termMonths}
          onPress={() => setPickedTerm(price.termMonths)}
          price={price}
          prices={prices}
          selected={price.termMonths === termMonths}
          shoeCount={selection.length}
        />
      ))}
    </BillingScreen>
  );
}

const styles = StyleSheet.create(theme => ({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  intro: {
    marginTop: theme.spacing[1],
    marginHorizontal: 28,
  },
  notice: {
    marginTop: theme.spacing[4],
    marginHorizontal: theme.spacing[4],
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
    marginTop: theme.spacing[2],
    marginHorizontal: theme.spacing[4],
  },
  limit: {
    marginTop: theme.spacing[2],
    marginHorizontal: theme.spacing[5],
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  summaryTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.body,
    fontSize: 14,
    fontWeight: theme.typography.weight.semibold,
  },
  priceBlock: {
    alignItems: 'flex-end',
  },
  total: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    ...theme.typography.text.titleSmall,
    ...theme.typography.tabular,
    fontWeight: theme.typography.weight.bold,
  },
}));
