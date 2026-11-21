import type { BillingSubscriptionDto } from '@stepwhere/types';
import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { getInitials } from '@/features/profile/profile-formatters';
import { BILLING_DEV_TOOLS_ENABLED } from '@/features/billing/billing-dev';
import { type BillingNotice, describeBillingError } from '@/features/billing/billing-errors';
import {
  formatBillingDate,
  formatPlanTerm,
  formatRupees,
  formatShoeCount,
  joinNames,
  possessive,
} from '@/features/billing/billing-format';
import { billingRoutes } from '@/features/billing/billing-routes';
import { deriveSubscriptionCardState } from '@/features/billing/billing-state';
import {
  BillingButton,
  BillingCard,
  BillingListRow,
  BillingLoadState,
  BillingNoticeBanner,
  BillingScreen,
  BillingText,
  Bold,
  BillingChip,
  IconPlate,
  InfoNote,
  KeyValueRows,
  PlanHeader,
  SectionLabel,
  ShoeAvatar,
  TextLink,
} from '@/features/billing/billing-ui';
import {
  CancelPlanSheet,
  ChangePeriodSheet,
  describeScheduledChange,
  SwapShoesSheet,
} from '@/features/billing/manage-sheets';
import { describeAutopayOff, describeRetry, SubscriptionStateChip } from '@/features/billing/subscription-card';
import { useAutopayActions } from '@/features/billing/use-autopay-actions';
import { type BillingShoe, useBilling } from '@/features/billing/use-billing';
import { applyFakeBillingOutcome } from '@/lib/api-client';
import {
  invalidateBillingDependents,
  useBillingChargesQuery,
  useCancelBillingSubscriptionMutation,
  useScheduleBillingRenewalMutation,
} from '@/query/hooks';

const PAYMENT_POLL_MS = 2_000;
const PAYMENT_POLL_WINDOW_MS = 30_000;

type Sheet = 'swap' | 'period' | 'cancel' | null;

function describeMethod(autopay: BillingSubscriptionDto['autopay']) {
  const method = autopay.method === 'upi'
    ? 'UPI'
    : autopay.method === 'card'
      ? 'Card'
      : autopay.method === 'enach'
        ? 'Net banking'
        : null;

  if (!method) {
    return 'Not set up';
  }

  return autopay.label ? `${method} · ${autopay.label}` : method;
}

function failedChargeTitle(kind: string) {
  switch (kind) {
    case 'first':
      return 'First payment didn’t go through';
    case 'add_shoes':
      return 'Payment for added shoes didn’t go through';
    case 'renewal':
    default:
      return 'Renewal didn’t go through';
  }
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { theme } = useUnistyles();
  // After "Pay now" the server confirms with the provider; poll until it does.
  const [isConfirmingPayment, setIsConfirmingPayment] = React.useState(false);
  const billing = useBilling({ refetchInterval: isConfirmingPayment ? PAYMENT_POLL_MS : false });
  const overview = billing.overview;
  const subscription = overview?.subscription ?? null;
  const isPayer = Boolean(subscription?.purchaser.isYou);
  const chargesQuery = useBillingChargesQuery(billing.organizationId, isPayer);
  const actions = useAutopayActions(billing.organizationId, 'subscription');
  const renewalMutation = useScheduleBillingRenewalMutation(billing.organizationId);
  const cancelMutation = useCancelBillingSubscriptionMutation(billing.organizationId);
  const [sheet, setSheetState] = React.useState<Sheet>(null);
  const [sheetKey, setSheetKey] = React.useState(0);
  const [sheetNotice, setSheetNotice] = React.useState<BillingNotice | null>(null);
  const [notice, setNotice] = React.useState<BillingNotice | null>(null);

  React.useEffect(() => {
    if (!isConfirmingPayment) {
      return;
    }

    const timeout = setTimeout(() => setIsConfirmingPayment(false), PAYMENT_POLL_WINDOW_MS);
    return () => clearTimeout(timeout);
  }, [isConfirmingPayment]);

  if (!overview) {
    return (
      <BillingScreen title="Subscription">
        <BillingLoadState error={billing.billingQuery.error} onRetry={() => void billing.billingQuery.refetch()} />
      </BillingScreen>
    );
  }

  if (!subscription) {
    return (
      <BillingScreen title="Subscription">
        <BillingCard>
          <PlanHeader caption="No plan yet" />
          <BillingText style={styles.gap} variant="meta">
            Every shoe gets a free month. After that, a plan keeps live location, history and alerts on.
          </BillingText>
          {overview.purchasesEnabled ? (
            <BillingButton label="Choose a plan" onPress={() => router.replace(billingRoutes.choosePlan())} size="small" style={styles.gapLarge} />
          ) : null}
        </BillingCard>
      </BillingScreen>
    );
  }

  const plan = subscription;
  const state = deriveSubscriptionCardState(overview, { nameForDevice: billing.nameForDevice });
  const coveredShoes = plan.deviceIds
    .map(id => billing.shoesById.get(id))
    .filter((shoe): shoe is BillingShoe => shoe !== undefined);
  const names = coveredShoes.map(shoe => shoe.name);
  const payerName = plan.purchaser.name ?? 'The payer';
  const isLive = plan.state === 'active' || plan.state === 'scheduled' || plan.state === 'past_due';
  const isWindingDown = plan.cancelAtPeriodEnd || plan.state === 'cancelled';
  const scheduledChange = describeScheduledChange(plan, billing.nameForDevice);
  const paidCount = chargesQuery.data?.charges.filter(charge => charge.status === 'paid' || charge.status === 'refunded' || charge.status === 'partially_refunded').length;
  const failed = plan.failedCharge;

  // Shown until the server reports the failed charge as settled.
  const showConfirmingPayment = isConfirmingPayment && plan.state === 'past_due';

  function setSheet(next: Sheet) {
    if (next) {
      setSheetKey(current => current + 1);
    }

    setSheetState(next);
  }

  function closeSheet() {
    setSheetState(null);
    setSheetNotice(null);
  }

  async function handleRenewalChange(input: Parameters<typeof renewalMutation.mutateAsync>[0]) {
    setSheetNotice(null);

    try {
      await renewalMutation.mutateAsync(input);
      closeSheet();
    } catch (error) {
      setSheetNotice(describeBillingError(error));
    }
  }

  async function handleCancel() {
    setSheetNotice(null);

    try {
      await cancelMutation.mutateAsync();
      closeSheet();
    } catch (error) {
      setSheetNotice(describeBillingError(error));
    }
  }

  async function runAction(action: () => Promise<BillingNotice | null>) {
    setNotice(null);
    setNotice(await action());
  }

  async function handlePayNow(chargeId: string) {
    setNotice(null);
    const result = await actions.payNow(chargeId);
    setNotice(result.notice);
    setIsConfirmingPayment(result.submitted);
  }

  async function handleFakeCharge(outcome: 'pay' | 'fail') {
    const chargeId = plan.nextCharge?.id ?? plan.failedCharge?.id;

    if (!chargeId) {
      return;
    }

    try {
      await applyFakeBillingOutcome('charge', chargeId, outcome, { operationName: 'applyFakeBillingOutcome' });
      invalidateBillingDependents(queryClient);
    } catch (error) {
      setNotice(describeBillingError(error));
    }
  }

  const nextChargeValue = plan.nextCharge
    ? `${formatRupees(plan.nextCharge.amountMinor)} · ${formatBillingDate(plan.nextCharge.dueOn)}`
    : isWindingDown
      ? 'None'
      : `${formatRupees(plan.renewalAmountMinor)} · ${formatBillingDate(plan.periodEndsAt)}`;

  return (
    <BillingScreen title="Subscription">
      {isPayer && plan.state === 'past_due' ? (
        <BillingCard tone="alert">
          <View style={styles.issueRow}>
            <IconPlate icon="alert" tone="red" />
            <View style={styles.flex}>
              <Text style={styles.issueTitle}>{failedChargeTitle(failed?.kind ?? 'renewal')}</Text>
              <BillingText variant="meta">
                {`Your bank declined the ${formatRupees(failed?.amountMinor ?? plan.renewalAmountMinor)} charge${failed ? ` on ${formatBillingDate(failed.dueOn)}` : ''}.${describeRetry(failed?.retryOn ?? null)} Tracking continues until `}
                <Bold>{formatBillingDate(plan.graceEndsAt)}</Bold>.
              </BillingText>
            </View>
          </View>
          <View style={styles.buttonRow}>
            {failed ? (
              <BillingButton
                busy={actions.isBusy}
                label={`Pay ${formatRupees(failed.amountMinor)} now`}
                onPress={() => {
                  void handlePayNow(failed.id);
                }}
                size="small"
                style={styles.flex}
              />
            ) : null}
            <BillingButton
              disabled={actions.isBusy}
              label="Change method"
              onPress={() => {
                void runAction(actions.setUpNewAutopay);
              }}
              size="small"
              style={styles.flex}
              variant="secondary"
            />
          </View>
        </BillingCard>
      ) : null}

      {showConfirmingPayment ? (
        <BillingNoticeBanner
          notice={{ title: 'Confirming your payment', body: 'This usually takes a few seconds.', icon: 'clock', tone: 'neutral' }}
          style={styles.notice}
        />
      ) : null}

      {state.kind === 'autopayOff' && isPayer ? (
        <BillingNoticeBanner
          notice={{
            title: 'Autopay is off',
            body: `${describeAutopayOff(state.reason, state.payerName, true)} You’re covered until ${formatBillingDate(state.coveredUntil)}, then tracking pauses.`,
            icon: 'pause',
            tone: 'amber',
            actionLabel: 'Set up autopay again',
          }}
          onAction={() => {
            void runAction(actions.setUpNewAutopay);
          }}
          style={styles.notice}
        />
      ) : null}

      {notice ? (
        <BillingNoticeBanner notice={notice} style={styles.notice} />
      ) : null}

      <BillingCard>
        <PlanHeader
          caption={`${formatShoeCount(plan.shoeCount)} · ${formatPlanTerm(plan.termMonths)}`}
          trailing={<SubscriptionStateChip state={state} />}
        />
        <KeyValueRows
          rows={[
            { icon: 'calendar', label: 'Next charge', value: nextChargeValue },
            {
              icon: 'autopay',
              label: 'Autopay',
              value: isPayer ? describeMethod(plan.autopay) : `${possessive(payerName)} bank account`,
            },
          ]}
        />
        <View style={styles.shoesRow}>
          <View style={styles.avatars}>
            {coveredShoes.map((shoe, index) => (
              <View key={shoe.deviceId} style={index > 0 && styles.avatarOverlap}>
                <ShoeAvatar shoe={shoe} size={28} />
              </View>
            ))}
          </View>
          <BillingText style={styles.flex} variant="meta">{`${joinNames(names)} covered`}</BillingText>
          <BillingText variant="caption">{`${coveredShoes.length} of ${plan.shoeCount}`}</BillingText>
        </View>
        {plan.pendingCheckoutId ? (
          <InfoNote icon="clock" style={styles.gapLarge}>A new autopay is waiting to be approved. The current one keeps working until then.</InfoNote>
        ) : null}
        {scheduledChange ? (
          <InfoNote icon="swap" style={styles.gapLarge}>
            <View style={styles.changeRow}>
              <BillingText style={styles.flex} variant="meta">{scheduledChange}</BillingText>
              {isPayer ? (
                <TextLink
                  label={renewalMutation.isPending ? 'Undoing…' : 'Undo'}
                  onPress={() => {
                    void handleRenewalChange({ nextDeviceIds: null, nextTermMonths: null });
                  }}
                />
              ) : null}
            </View>
          </InfoNote>
        ) : null}
      </BillingCard>

      {isPayer ? (
        <BillingCard flush>
          {isLive && !isWindingDown ? (
            <BillingListRow
              compact
              leading={<IconPlate icon="plus" tone="neutral" />}
              onPress={() => router.push(billingRoutes.addShoes())}
              subtitle="Pay only for the rest of this period"
              title="Add shoes"
            />
          ) : null}
          {!isWindingDown ? (
            <>
              <BillingListRow
                compact
                leading={<IconPlate icon="swap" tone="neutral" />}
                onPress={() => setSheet('swap')}
                showDivider
                subtitle="From your next renewal"
                title="Swap shoes"
              />
              <BillingListRow
                compact
                leading={<IconPlate icon="calendar" tone="neutral" />}
                onPress={() => setSheet('period')}
                showDivider
                subtitle="From your next renewal"
                title="Change billing period"
              />
            </>
          ) : null}
          <BillingListRow
            compact
            leading={<IconPlate icon="autopay" tone="neutral" />}
            onPress={() => {
              void runAction(actions.setUpNewAutopay);
            }}
            showDivider
            subtitle={describeMethod(plan.autopay)}
            title="Payment method"
          />
          <BillingListRow
            compact
            leading={<IconPlate icon="document" tone="neutral" />}
            onPress={() => router.push(billingRoutes.invoices())}
            showDivider
            subtitle={paidCount == null ? 'Receipts and GST invoices' : paidCount === 1 ? '1 payment' : `${paidCount} payments`}
            title="Invoices"
          />
          {isWindingDown ? (
            <BillingListRow
              compact
              leading={<IconPlate icon="refresh" tone="green" />}
              onPress={() => {
                void runAction(actions.resumePlan);
              }}
              showDivider
              subtitle={`Keep your plan after ${formatBillingDate(plan.periodEndsAt)}`}
              title="Turn autopay back on"
            />
          ) : (
            <BillingListRow
              compact
              danger
              leading={<IconPlate icon="close" tone="red" />}
              onPress={() => setSheet('cancel')}
              showDivider
              subtitle={`You stay covered until ${formatBillingDate(plan.periodEndsAt)}`}
              title="Cancel plan"
            />
          )}
        </BillingCard>
      ) : (
        <>
          <BillingCard>
            <View style={styles.issueRow}>
              <LinearGradient
                colors={[theme.colors.avatar.parentGradientStart, theme.colors.avatar.parentGradientEnd]}
                end={{ x: 1, y: 0.5 }}
                start={{ x: 0, y: 0.5 }}
                style={styles.payerAvatar}
              >
                <Text style={styles.payerInitials}>{getInitials(payerName)}</Text>
              </LinearGradient>
              <View style={styles.flex}>
                <Text style={styles.issueTitle}>{`Managed by ${payerName}`}</Text>
                <BillingText variant="meta">
                  {`Autopay runs from ${possessive(payerName)} bank account. Only ${plan.purchaser.name ?? 'they'} can change or cancel the plan.`}
                </BillingText>
              </View>
            </View>
          </BillingCard>
          <SectionLabel>Covered shoes</SectionLabel>
          <BillingCard flush style={styles.listCard}>
            {coveredShoes.map((shoe, index) => (
              <BillingListRow
                key={shoe.deviceId}
                leading={<ShoeAvatar shoe={shoe} />}
                showDivider={index > 0}
                subtitle={`Covered until ${formatBillingDate(shoe.device.coveredUntil ?? plan.periodEndsAt)}`}
                title={shoe.name}
                trailing={<BillingChip label="Covered" tone="green" />}
              />
            ))}
          </BillingCard>
        </>
      )}

      {BILLING_DEV_TOOLS_ENABLED && isPayer && (plan.nextCharge || plan.failedCharge) ? (
        <BillingCard>
          <BillingText variant="caption">Test tools (dev builds only)</BillingText>
          <View style={styles.buttonRow}>
            <BillingButton label="Charge succeeds" onPress={() => void handleFakeCharge('pay')} size="small" style={styles.flex} variant="secondary" />
            <BillingButton label="Charge fails" onPress={() => void handleFakeCharge('fail')} size="small" style={styles.flex} variant="secondary" />
          </View>
        </BillingCard>
      ) : null}

      <SwapShoesSheet
        busy={renewalMutation.isPending}
        key={`swap-${sheetKey}`}
        notice={sheet === 'swap' ? sheetNotice : null}
        onAddInstead={() => {
          closeSheet();
          router.push(billingRoutes.addShoes());
        }}
        onClose={closeSheet}
        onSubmit={(nextDeviceIds) => {
          void handleRenewalChange({ nextDeviceIds, nextTermMonths: plan.nextTermMonths });
        }}
        shoes={billing.shoes}
        subscription={plan}
        visible={sheet === 'swap'}
      />
      <ChangePeriodSheet
        busy={renewalMutation.isPending}
        key={`period-${sheetKey}`}
        notice={sheet === 'period' ? sheetNotice : null}
        onClose={closeSheet}
        onSubmit={(nextTermMonths) => {
          void handleRenewalChange({ nextDeviceIds: plan.nextDeviceIds, nextTermMonths });
        }}
        prices={overview.prices.prices}
        subscription={plan}
        visible={sheet === 'period'}
      />
      <CancelPlanSheet
        busy={cancelMutation.isPending}
        names={names}
        notice={sheet === 'cancel' ? sheetNotice : null}
        onClose={closeSheet}
        onConfirm={() => {
          void handleCancel();
        }}
        subscription={plan}
        visible={sheet === 'cancel'}
      />
    </BillingScreen>
  );
}

const styles = StyleSheet.create(theme => ({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  gap: {
    marginTop: theme.spacing[2],
  },
  gapLarge: {
    marginTop: theme.spacing[3],
  },
  notice: {
    marginTop: theme.spacing[3],
    marginHorizontal: theme.spacing[4],
  },
  issueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[3],
  },
  issueTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.body,
    fontSize: 14,
    fontWeight: theme.typography.weight.semibold,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: theme.spacing[2],
    marginTop: theme.spacing[3],
  },
  shoesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: theme.spacing[3],
  },
  avatars: {
    flexDirection: 'row',
  },
  avatarOverlap: {
    marginLeft: -4,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  payerAvatar: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payerInitials: {
    color: theme.colors.avatar.onParentGradient,
    fontFamily: theme.typography.family.display,
    ...theme.typography.text.meta,
    fontWeight: theme.typography.weight.semibold,
  },
  listCard: {
    marginTop: theme.spacing[2],
  },
}));
