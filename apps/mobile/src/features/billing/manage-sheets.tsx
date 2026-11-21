import type { BillingPriceDto, BillingSubscriptionDto, BillingTermMonths } from '@stepwhere/types';
import React from 'react';
import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { BillingNotice } from './billing-errors';
import {
  formatBillingDate,
  formatPlanTerm,
  formatRupees,
  joinNames,
} from './billing-format';
import { describeDeviceStatus } from './billing-state';
import {
  BillingButton,
  BillingCard,
  BillingListRow,
  BillingNoticeBanner,
  BillingSheet,
  BillingText,
  Bold,
  CheckCircle,
  InfoNote,
  ShoeAvatar,
  TextLink,
} from './billing-ui';
import { PlanOption, sortPrices } from './plan-option';
import type { BillingShoe } from './use-billing';

// Sheets keep their draft in local state; the caller gives each opening a new
// `key` so the draft starts from the plan as it is now.
type SheetProps = {
  busy: boolean;
  notice: BillingNotice | null;
  onClose: () => void;
  subscription: BillingSubscriptionDto;
  visible: boolean;
};

function sameShoes(left: string[], right: string[]) {
  return left.length === right.length && left.every(id => right.includes(id));
}

/** Swap which shoes the plan covers from the next renewal. Same count, same price. */
export function SwapShoesSheet({
  busy,
  notice,
  onAddInstead,
  onClose,
  onSubmit,
  shoes,
  subscription,
  visible,
}: SheetProps & {
  onAddInstead: () => void;
  onSubmit: (nextDeviceIds: string[] | null) => void;
  shoes: BillingShoe[];
}) {
  const initial = subscription.nextDeviceIds ?? subscription.deviceIds;
  const [selection, setSelection] = React.useState(initial);
  const renewsOn = formatBillingDate(subscription.periodEndsAt);
  const candidates = shoes.filter(shoe => shoe.child || subscription.deviceIds.includes(shoe.deviceId));
  const priceAfter = subscription.perShoeMinor * selection.length;

  function toggle(deviceId: string) {
    if (selection.includes(deviceId)) {
      setSelection(selection.filter(id => id !== deviceId));
    } else if (selection.length < subscription.shoeCount) {
      setSelection([...selection, deviceId]);
    }
  }

  function subtitleFor(shoe: BillingShoe) {
    const onPlan = subscription.deviceIds.includes(shoe.deviceId);

    if (onPlan) {
      return selection.includes(shoe.deviceId) ? 'Covered now' : `Covered now · leaves on ${renewsOn}`;
    }

    if (shoe.device.coverage === 'trial') {
      return `Free month · ${shoe.device.trialDaysRemaining === 1 ? '1 day' : `${shoe.device.trialDaysRemaining} days`} left`;
    }

    return describeDeviceStatus(shoe.device);
  }

  return (
    <BillingSheet onClose={onClose} visible={visible}>
      <BillingText variant="title">Swap covered shoes</BillingText>
      <BillingText style={styles.body}>
        {`Your plan covers ${subscription.shoeCount === 1 ? '1 shoe' : `${subscription.shoeCount} shoes`}. The swap applies on `}
        <Bold>{renewsOn}</Bold>
        {selection.length === subscription.shoeCount
          ? `, when it renews. The price stays ${formatRupees(subscription.renewalAmountMinor)}.`
          : `, when it renews. From then it costs ${formatRupees(priceAfter)}.`}
      </BillingText>
      <BillingCard flush style={styles.list}>
        {candidates.map((shoe, index) => (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selection.includes(shoe.deviceId) }}
            key={shoe.deviceId}
            onPress={() => toggle(shoe.deviceId)}
          >
            <BillingListRow
              leading={<ShoeAvatar shoe={shoe} />}
              showDivider={index > 0}
              subtitle={subtitleFor(shoe)}
              title={shoe.name}
              trailing={<CheckCircle checked={selection.includes(shoe.deviceId)} />}
            />
          </Pressable>
        ))}
      </BillingCard>
      <View style={styles.metaRow}>
        <BillingText variant="meta">{`${selection.length} of ${subscription.shoeCount} selected`}</BillingText>
        <TextLink label="Add a shoe instead" onPress={onAddInstead} />
      </View>
      {notice ? <BillingNoticeBanner notice={notice} style={styles.notice} /> : null}
      <BillingButton
        busy={busy}
        disabled={selection.length === 0 || sameShoes(selection, initial)}
        label="Schedule swap"
        onPress={() => onSubmit(sameShoes(selection, subscription.deviceIds) ? null : selection)}
        style={styles.submit}
      />
    </BillingSheet>
  );
}

/** Change the billing period from the next renewal. */
export function ChangePeriodSheet({
  busy,
  notice,
  onClose,
  onSubmit,
  prices,
  subscription,
  visible,
}: SheetProps & {
  onSubmit: (nextTermMonths: BillingTermMonths | null) => void;
  prices: BillingPriceDto[];
}) {
  const initial = subscription.nextTermMonths ?? subscription.termMonths;
  const [term, setTerm] = React.useState<BillingTermMonths>(initial);
  const shoeCount = (subscription.nextDeviceIds ?? subscription.deviceIds).length;

  return (
    <BillingSheet onClose={onClose} visible={visible}>
      <BillingText variant="title">Change billing period</BillingText>
      <BillingText style={styles.body}>
        {'The new period starts on '}<Bold>{formatBillingDate(subscription.periodEndsAt)}</Bold>, when your plan renews.
      </BillingText>
      <View style={styles.options}>
        {sortPrices(prices).map(price => (
          <PlanOption
            caption={price.termMonths === subscription.termMonths ? 'Your current period' : undefined}
            key={price.termMonths}
            onPress={() => setTerm(price.termMonths)}
            price={price}
            prices={prices}
            selected={term === price.termMonths}
            shoeCount={shoeCount}
          />
        ))}
      </View>
      {notice ? <BillingNoticeBanner notice={notice} style={styles.notice} /> : null}
      <BillingButton
        busy={busy}
        disabled={term === initial}
        label="Change period"
        onPress={() => onSubmit(term === subscription.termMonths ? null : term)}
        style={styles.submit}
      />
    </BillingSheet>
  );
}

export function CancelPlanSheet({
  busy,
  names,
  notice,
  onClose,
  onConfirm,
  subscription,
  visible,
}: SheetProps & { names: string[]; onConfirm: () => void }) {
  return (
    <BillingSheet onClose={onClose} visible={visible}>
      <BillingText variant="title">Cancel your plan?</BillingText>
      <BillingText style={styles.body}>
        {`Autopay stops now and you won’t be charged again. ${joinNames(names)} ${names.length === 1 ? 'stays' : 'stay'} covered until `}
        <Bold>{formatBillingDate(subscription.periodEndsAt)}</Bold>
        {`, then ${names.length === 1 ? 'tracking' : 'their tracking'} pauses.`}
      </BillingText>
      <InfoNote style={styles.notice}>{'Payments already made aren’t refunded for unused days.'}</InfoNote>
      {notice ? <BillingNoticeBanner notice={notice} style={styles.notice} /> : null}
      <BillingButton busy={busy} label="Cancel plan" onPress={onConfirm} style={styles.submit} variant="danger" />
      <BillingButton label="Keep plan" onPress={onClose} style={styles.secondary} variant="secondary" />
    </BillingSheet>
  );
}

/** "From 26 May: Riya and Kabir · 12-month plan". */
export function describeScheduledChange(subscription: BillingSubscriptionDto, nameForDevice: (id: string) => string) {
  if (!subscription.nextDeviceIds && !subscription.nextTermMonths) {
    return null;
  }

  const parts = [
    subscription.nextDeviceIds ? joinNames(subscription.nextDeviceIds.map(nameForDevice)) : null,
    subscription.nextTermMonths ? formatPlanTerm(subscription.nextTermMonths) : null,
  ].filter(Boolean);

  return `From ${formatBillingDate(subscription.periodEndsAt)}: ${parts.join(' · ')}`;
}

const styles = StyleSheet.create(theme => ({
  body: {
    marginTop: 6,
  },
  list: {
    marginTop: 14,
    marginHorizontal: 0,
  },
  options: {
    marginTop: theme.spacing[2],
    marginHorizontal: -theme.spacing[4],
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing[3],
  },
  notice: {
    marginTop: theme.spacing[3],
  },
  submit: {
    marginTop: theme.spacing[4],
  },
  secondary: {
    marginTop: theme.spacing[2],
  },
}));
