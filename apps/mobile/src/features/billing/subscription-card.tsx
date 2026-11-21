import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { AppIconName } from '@/components/ui/app-icon';

import type { BillingNotice } from './billing-errors';
import {
  daysBetween,
  formatBillingDate,
  formatDayCount,
  formatPlanTerm,
  formatRelativeBillingDate,
  formatRupees,
  formatShoeCount,
  joinNames,
  possessive,
  toIstDateKey,
} from './billing-format';
import { billingRoutes } from './billing-routes';
import { deriveSubscriptionCardState, type SubscriptionCardState } from './billing-state';
import {
  BillingButton,
  BillingChip,
  BillingNoticeBanner,
  BillingText,
  Bold,
  type BillingTone,
  InfoNote,
  PlanHeader,
  ProgressBar,
} from './billing-ui';
import { useAutopayActions } from './use-autopay-actions';
import { useBilling } from './use-billing';

type PlanState = Extract<SubscriptionCardState, { shoeCount: number }>;

function planCaption(state: PlanState) {
  if (!state.isPayer && (state.kind === 'otherActive' || state.kind === 'otherIssue')) {
    return `${formatShoeCount(state.shoeCount)} · paid by ${state.payerName ?? 'someone else'}`;
  }

  return `${formatShoeCount(state.shoeCount)} · ${formatPlanTerm(state.termMonths)}`;
}

function chipFor(state: SubscriptionCardState): { label: string; tone: BillingTone; icon?: AppIconName } | null {
  switch (state.kind) {
    case 'trial':
      return { label: 'Free trial', tone: 'green' };
    case 'ending':
      if (state.graceEndsOn) {
        return { label: 'Free month ended', tone: 'red', icon: 'clock' };
      }

      return { label: state.daysLeft <= 0 ? 'Ends today' : `${formatDayCount(state.daysLeft)} left`, tone: 'amber', icon: 'clock' };
    case 'scheduled':
      return { label: `Starts ${formatBillingDate(state.startsOn)}`, tone: 'green', icon: 'calendar' };
    case 'bank':
      return { label: 'Waiting for bank', tone: 'amber', icon: 'clock' };
    case 'active':
    case 'otherActive':
      return { label: 'Active', tone: 'green' };
    case 'cancelled':
      return { label: 'Won’t renew', tone: 'neutral' };
    case 'autopayOff':
      return { label: 'Autopay off', tone: 'amber', icon: 'pause' };
    case 'issue':
    case 'otherIssue':
      return { label: 'Payment failed', tone: 'red', icon: 'alert' };
    case 'expired':
      return { label: 'Expired', tone: 'red' };
    default:
      return null;
  }
}

/** The chip shown on this card and atop the Subscription screen. */
export function SubscriptionStateChip({ state }: { state: SubscriptionCardState }) {
  const chip = chipFor(state);
  return chip ? <BillingChip icon={chip.icon} label={chip.label} tone={chip.tone} /> : null;
}

function chargeName(kind: string) {
  switch (kind) {
    case 'renewal':
      return 'renewal';
    case 'first':
      return 'first payment';
    case 'add_shoes':
      return 'payment for the added shoes';
    default:
      return 'payment';
  }
}

export function describeRetry(retryOn: string | null) {
  if (!retryOn) {
    return '';
  }

  const when = formatRelativeBillingDate(retryOn);
  return when === 'Tomorrow' ? ' We’ll try again tomorrow.' : when === 'Today' ? ' We’ll try again today.' : ` We’ll try again on ${when}.`;
}

export function describeAutopayOff(reason: string, payerName: string | null, isPayer: boolean) {
  if (!isPayer) {
    return `${possessive(payerName ?? 'The payer')} autopay was turned off.`;
  }

  switch (reason) {
    case 'card_expired':
      return 'Your card expired, so autopay stopped.';
    case 'paused_by_customer':
      return 'Autopay was paused in your UPI app.';
    case 'cancelled':
    case 'failed':
      return 'Autopay stopped working.';
    case 'off_by_customer':
    default:
      return 'Autopay was turned off in your UPI app.';
  }
}

/**
 * Profile → Subscription card. Sits between the identity card and Connected
 * children, and renders nothing while billing is off or still loading, so the
 * Profile tab looks exactly as it did before billing.
 */
export function SubscriptionCard() {
  const router = useRouter();
  const billing = useBilling();
  const actions = useAutopayActions(billing.organizationId, 'app');
  const [notice, setNotice] = React.useState<BillingNotice | null>(null);
  const overview = billing.overview;

  if (!overview) {
    return null;
  }

  const state = deriveSubscriptionCardState(overview, { nameForDevice: billing.nameForDevice });

  if (state.kind === 'hidden') {
    return null;
  }

  const hasPlan = Boolean(overview.subscription);
  const canBuy = overview.purchasesEnabled;
  const openPlan = () => router.push(billingRoutes.subscription());
  const choosePlan = () => router.push(billingRoutes.choosePlan());

  async function run(action: () => Promise<BillingNotice | null>) {
    setNotice(null);
    setNotice(await action());
  }

  // Before a plan exists the card names the shoes instead of a plan.
  const caption = 'shoeCount' in state && hasPlan ? planCaption(state) : joinNames(state.names);

  return (
    <Pressable
      accessibilityHint={hasPlan ? 'Opens your subscription' : undefined}
      accessibilityRole={hasPlan ? 'button' : undefined}
      disabled={!hasPlan}
      onPress={openPlan}
      style={({ pressed }) => [styles.card, pressed && hasPlan && styles.pressed]}
    >
      <PlanHeader caption={caption} trailing={<SubscriptionStateChip state={state} />} />
      <CardBody
        canBuy={canBuy}
        choosePlan={choosePlan}
        isBusy={actions.isBusy}
        onFixPayment={openPlan}
        onResume={() => {
          void run(actions.resumePlan);
        }}
        onSetUpAutopay={() => {
          void run(actions.setUpNewAutopay);
        }}
        onOpenPlan={openPlan}
        state={state}
      />
      {notice ? <BillingNoticeBanner notice={notice} style={styles.notice} /> : null}
    </Pressable>
  );
}

function CardBody({
  canBuy,
  choosePlan,
  isBusy,
  onFixPayment,
  onOpenPlan,
  onResume,
  onSetUpAutopay,
  state,
}: {
  canBuy: boolean;
  choosePlan: () => void;
  isBusy: boolean;
  onFixPayment: () => void;
  onOpenPlan: () => void;
  onResume: () => void;
  onSetUpAutopay: () => void;
  state: SubscriptionCardState;
}) {
  const choosePlanButton = canBuy
    ? <BillingButton label="Choose a plan" onPress={choosePlan} size="small" style={styles.button} />
    : null;

  switch (state.kind) {
    case 'trial':
      return (
        <>
          <View style={styles.trialLine}>
            <BillingText><Bold>{formatDayCount(state.daysLeft)}</Bold> left</BillingText>
            <BillingText>{`Ends ${formatBillingDate(state.endsOn)}`}</BillingText>
          </View>
          <ProgressBar progress={state.progress} tone="green" />
          {choosePlanButton}
        </>
      );
    case 'ending':
      return (
        <>
          <View style={styles.trialLine}>
            {state.graceEndsOn ? (
              <BillingText>{`${possessive(state.firstName)} free month has ended`}</BillingText>
            ) : (
              <BillingText>{`${possessive(state.firstName)} free month ends `}<Bold>{formatBillingDate(state.endsOn)}</Bold></BillingText>
            )}
          </View>
          <ProgressBar progress={state.progress} tone="amber" />
          <BillingText style={styles.gap} variant="meta">
            {state.graceEndsOn
              ? <>Choose a plan before <Bold>{formatBillingDate(state.graceEndsOn)}</Bold> to keep tracking.</>
              : 'Set up autopay now. Nothing is charged until then.'}
          </BillingText>
          {choosePlanButton}
        </>
      );
    case 'scheduled':
      return (
        <>
          {state.firstCharge ? (
            <Pressable accessibilityRole="button" onPress={onOpenPlan}>
              <InfoNote icon="clock" style={styles.gapLarge}>
                <BillingText variant="meta">
                  First charge <Bold>{formatRupees(state.firstCharge.amountMinor)}</Bold>{` on ${formatBillingDate(state.firstCharge.dueOn)}`}
                </BillingText>
              </InfoNote>
            </Pressable>
          ) : null}
          <BillingText style={styles.gap} variant="meta">
            {state.names.length === 1
              ? `${state.names[0]} is on the free month until then.`
              : `${joinNames(state.names)} are on their free month until then.`}
          </BillingText>
        </>
      );
    case 'bank':
      return (
        <BillingText style={styles.gapLarge} variant="meta">
          Your bank is approving autopay. Net banking can take up to 2 working days. Your free month keeps running.
        </BillingText>
      );
    case 'active':
      return (
        <InfoNote icon="calendar" style={styles.gapLarge}>
          <BillingText variant="meta">
            {`Renews ${formatBillingDate(state.renewsOn)} · `}<Bold>{formatRupees(state.renewalAmountMinor)}</Bold>
          </BillingText>
        </InfoNote>
      );
    case 'otherActive':
      return (
        <InfoNote icon="calendar" style={styles.gapLarge}>
          {`Renews ${formatBillingDate(state.renewsOn)}`}
        </InfoNote>
      );
    case 'cancelled':
      return (
        <>
          <InfoNote icon="calendar" style={styles.gapLarge}>
            {`Covered until ${formatBillingDate(state.coveredUntil)}`}
          </InfoNote>
          {state.isPayer && canBuy ? (
            <BillingButton busy={isBusy} label="Turn autopay back on" onPress={onResume} size="small" style={styles.button} variant="secondary" />
          ) : null}
        </>
      );
    case 'autopayOff':
      return (
        <>
          <BillingText style={styles.gapLarge} variant="meta">
            {`${describeAutopayOff(state.reason, state.payerName, state.isPayer)} You’re covered until `}
            <Bold>{formatBillingDate(state.coveredUntil)}</Bold>, then tracking pauses.
          </BillingText>
          {state.isPayer && canBuy ? (
            <BillingButton busy={isBusy} label="Set up autopay again" onPress={onSetUpAutopay} size="small" style={styles.button} />
          ) : null}
        </>
      );
    case 'issue':
      return (
        <>
          <BillingText style={styles.gapLarge} variant="meta">
            {`The ${formatRupees(state.amountMinor)} ${chargeName(state.chargeKind)} didn’t go through.${describeRetry(state.retryOn)} Tracking continues until `}
            <Bold>{formatBillingDate(state.graceEndsOn)}</Bold>.
          </BillingText>
          <BillingButton label="Fix payment" onPress={onFixPayment} size="small" style={styles.button} variant="danger" />
        </>
      );
    case 'otherIssue': {
      const payer = state.payerName ?? 'The payer';
      return (
        <BillingText style={styles.gapLarge} variant="meta">
          {`${possessive(payer)} autopay didn’t go through. Only ${state.payerName ?? 'they'} can fix it, by `}
          <Bold>{formatBillingDate(state.graceEndsOn)}</Bold>.
        </BillingText>
      );
    }
    case 'expired':
      return (
        <>
          <BillingText style={styles.gapLarge} variant="meta">
            {state.pausedCount > 0
              ? `Tracking is paused for ${formatShoeCount(state.pausedCount)}.`
              : state.graceEndsOn && daysBetween(toIstDateKey(new Date()), state.graceEndsOn) >= 0
                ? <>Tracking pauses on <Bold>{formatBillingDate(state.graceEndsOn)}</Bold>.</>
                : 'Your plan has ended.'}
          </BillingText>
          {choosePlanButton}
        </>
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create(theme => ({
  card: {
    marginTop: theme.spacing[4],
    marginHorizontal: theme.spacing[5],
    padding: theme.spacing[4],
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },
  trialLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: theme.spacing[2],
    marginTop: 14,
  },
  gap: {
    marginTop: theme.spacing[2],
  },
  gapLarge: {
    marginTop: theme.spacing[3],
  },
  button: {
    marginTop: 14,
  },
  notice: {
    marginTop: theme.spacing[3],
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
