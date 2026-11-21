import type { BillingSubscriptionDto } from '@stepwhere/types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { buildIdempotencyKey } from '@/features/children/add-child-utils';
import {
  BillingErrorCode,
  type BillingNotice,
  billingNotices,
  describeBillingError,
  hasErrorCode,
} from '@/features/billing/billing-errors';
import { formatBillingDate, joinNames } from '@/features/billing/billing-format';
import { describeSchedule } from '@/features/billing/billing-quote';
import { billingRoutes } from '@/features/billing/billing-routes';
import { describeDeviceStatus, getAddableDevices } from '@/features/billing/billing-state';
import {
  BillingButton,
  BillingLoadState,
  BillingNoticeBanner,
  BillingScreen,
  BillingText,
  ChargeTimeline,
  FinePrint,
  SectionLabel,
} from '@/features/billing/billing-ui';
import { ShoeTile } from '@/features/billing/shoe-tile';
import { useBilling } from '@/features/billing/use-billing';
import { useRequoteOnExpiry } from '@/features/billing/use-requote-on-expiry';
import { useAddBillingShoesMutation, useBillingQuoteQuery } from '@/query/hooks';

function describeAutopay(subscription: BillingSubscriptionDto) {
  const method = subscription.autopay.method === 'upi'
    ? 'UPI'
    : subscription.autopay.method === 'card'
      ? 'Card'
      : subscription.autopay.method === 'enach'
        ? 'Net banking'
        : 'your autopay';
  return subscription.autopay.label ? `${method} · ${subscription.autopay.label}` : method;
}

export default function AddShoesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ deviceId?: string }>();
  const billing = useBilling();
  const overview = billing.overview;
  const subscription = overview?.subscription ?? null;
  const [picked, setPicked] = React.useState<string[] | null>(null);
  const [notice, setNotice] = React.useState<BillingNotice | null>(null);
  const attemptRef = React.useRef<{ quoteId: string; key: string } | null>(null);
  const addMutation = useAddBillingShoesMutation();

  const addable = overview ? getAddableDevices(overview) : [];
  const room = subscription && overview ? Math.max(overview.prices.maxShoes - subscription.shoeCount, 0) : 0;
  // A locked child's "Add" button preselects that shoe; otherwise every linked shoe that's off the plan.
  const defaultSelection = params.deviceId && addable.some(device => device.deviceId === params.deviceId)
    ? [params.deviceId]
    : addable.filter(device => device.childId).map(device => device.deviceId).slice(0, room);
  const selection = picked ?? defaultSelection;
  const quoteQuery = useBillingQuoteQuery(
    billing.organizationId,
    subscription && selection.length > 0 ? { kind: 'add_shoes', deviceIds: selection } : null,
  );
  const quote = quoteQuery.isPlaceholderData ? undefined : quoteQuery.data;
  const requote = useRequoteOnExpiry(quote, quoteQuery.refetch);

  if (!overview || !subscription) {
    return (
      <BillingScreen title="Add shoes">
        {overview && !subscription ? (
          <BillingNoticeBanner
            notice={{ title: 'There’s no plan yet', body: 'Choose a plan first, then add shoes to it.', icon: 'info', tone: 'neutral', actionLabel: 'Choose a plan' }}
            onAction={() => router.replace(billingRoutes.choosePlan())}
            style={styles.notice}
          />
        ) : (
          <BillingLoadState error={billing.billingQuery.error} onRetry={() => void billing.billingQuery.refetch()} />
        )}
      </BillingScreen>
    );
  }

  const plan = subscription;
  const onPlanShoes = plan.deviceIds.map(id => billing.shoesById.get(id)).filter(shoe => shoe !== undefined);
  const addableShoes = addable.map(device => billing.shoesById.get(device.deviceId)).filter(shoe => shoe !== undefined);
  const addedNames = selection.map(billing.nameForDevice);

  function toggle(deviceId: string) {
    if (selection.includes(deviceId)) {
      setPicked(selection.filter(id => id !== deviceId));
    } else if (selection.length < room) {
      setPicked([...selection, deviceId]);
    }

    requote.reset();
  }

  async function handleAdd() {
    if (!quote) {
      return;
    }

    setNotice(null);

    if (attemptRef.current?.quoteId !== quote.id) {
      attemptRef.current = { quoteId: quote.id, key: buildIdempotencyKey() };
    }

    try {
      await addMutation.mutateAsync({ quoteId: quote.id, idempotencyKey: attemptRef.current.key });
      router.back();
    } catch (error) {
      if (hasErrorCode(error, BillingErrorCode.quoteExpired)) {
        await quoteQuery.refetch();
        setNotice(billingNotices.planChanged);
      } else {
        setNotice(describeBillingError(error));
      }
    }
  }

  const visibleNotice = notice ?? (requote.changed ? billingNotices.planChanged : null);

  return (
    <BillingScreen
      footer={(
        <>
          <BillingButton
            busy={addMutation.isPending || (quoteQuery.isFetching && !quote)}
            disabled={!quote || selection.length === 0}
            label={selection.length === 0 ? 'Add shoes' : `Add ${joinNames(addedNames)}`}
            onPress={() => {
              void handleAdd();
            }}
          />
          <FinePrint
            segments={[
              'Charged by autopay to ',
              { bold: describeAutopay(plan) },
              '. We’ll remind you the day before. Prices include GST.',
            ]}
          />
        </>
      )}
      title="Add shoes"
    >
      <BillingText align="center" style={styles.intro} variant="meta">
        {`Your plan covers ${joinNames(onPlanShoes.map(shoe => shoe.name))} until ${formatBillingDate(plan.periodEndsAt)}. Pick the shoes to add.`}
      </BillingText>

      {visibleNotice ? (
        <BillingNoticeBanner
          notice={visibleNotice}
          onAction={visibleNotice.action === 'review' ? () => {
            setNotice(null);
            requote.acknowledge();
          } : visibleNotice.action === 'retry' ? () => void handleAdd() : undefined}
          style={styles.notice}
        />
      ) : quoteQuery.error ? (
        <BillingNoticeBanner notice={describeBillingError(quoteQuery.error)} onAction={() => void quoteQuery.refetch()} style={styles.notice} />
      ) : null}

      <SectionLabel>Shoes</SectionLabel>
      <View style={styles.tiles}>
        {onPlanShoes.map(shoe => (
          <ShoeTile dim disabled key={shoe.deviceId} onPress={() => undefined} selected shoe={shoe} subtitle="On plan" />
        ))}
        {addableShoes.map(shoe => (
          <ShoeTile
            dim={!shoe.child && !selection.includes(shoe.deviceId)}
            key={shoe.deviceId}
            onPress={() => toggle(shoe.deviceId)}
            selected={selection.includes(shoe.deviceId)}
            shoe={shoe}
            subtitle={describeDeviceStatus(shoe.device)}
          />
        ))}
      </View>
      {addableShoes.length === 0 ? (
        <BillingText style={styles.hint} variant="caption">Every shoe in your family is already on the plan.</BillingText>
      ) : room === 0 ? (
        <BillingText style={styles.hint} variant="caption">{`A plan covers up to ${overview.prices.maxShoes} shoes.`}</BillingText>
      ) : null}

      {quote ? (
        <>
          <SectionLabel>{'What you’ll pay'}</SectionLabel>
          <ChargeTimeline
            lines={describeSchedule(
              { ...quote, schedule: quote.schedule.filter(line => line.kind !== 'verify') },
              { devices: overview.devices, nameForDevice: billing.nameForDevice },
            )}
          />
        </>
      ) : selection.length > 0 && quoteQuery.isFetching ? (
        <BillingLoadState />
      ) : null}
    </BillingScreen>
  );
}

const styles = StyleSheet.create(theme => ({
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
  hint: {
    marginTop: theme.spacing[2],
    marginHorizontal: theme.spacing[5],
  },
}));
