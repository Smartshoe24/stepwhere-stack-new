import type { BillingQuoteDto, BillingTermMonths } from '@stepwhere/types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { buildIdempotencyKey } from '@/features/children/add-child-utils';
import {
  BillingErrorCode,
  type BillingNotice,
  billingNotices,
  checkoutInProgressNotice,
  describeBillingError,
  hasErrorCode,
  planSetByOtherNotice,
} from '@/features/billing/billing-errors';
import { formatRupees, formatShoeCount, formatTerm, joinNames } from '@/features/billing/billing-format';
import { describeSchedule, getQuoteFingerprint, isQuoteExpired } from '@/features/billing/billing-quote';
import { billingRoutes } from '@/features/billing/billing-routes';
import {
  BillingButton,
  BillingCard,
  BillingLoadState,
  BillingNoticeBanner,
  BillingScreen,
  BillingText,
  Bold,
  ChargeTimeline,
  FinePrint,
  InfoNote,
  PlanHeader,
  SectionLabel,
  ShoeAvatar,
  TextLink,
} from '@/features/billing/billing-ui';
import { startAutopayCheckout } from '@/features/billing/checkout-adapter';
import { useBilling } from '@/features/billing/use-billing';
import { useRequoteOnExpiry } from '@/features/billing/use-requote-on-expiry';
import { useBillingQuoteQuery, useStartBillingCheckoutMutation } from '@/query/hooks';

const TERMS: BillingTermMonths[] = [3, 6, 12];

function parseTerm(value: string | undefined): BillingTermMonths | null {
  const term = Number(value);
  return TERMS.find(entry => entry === term) ?? null;
}

export default function ReviewPlanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ deviceIds?: string; termMonths?: string }>();
  const deviceIds = React.useMemo(() => (params.deviceIds ?? '').split(',').filter(Boolean), [params.deviceIds]);
  const termMonths = parseTerm(params.termMonths);
  const billing = useBilling();
  const quoteQuery = useBillingQuoteQuery(
    billing.organizationId,
    deviceIds.length > 0 && termMonths ? { kind: 'new_plan', deviceIds, termMonths } : null,
  );
  const quote = quoteQuery.isPlaceholderData ? undefined : quoteQuery.data;
  const requote = useRequoteOnExpiry(quote, quoteQuery.refetch);
  const checkoutMutation = useStartBillingCheckoutMutation();
  const attemptRef = React.useRef<{ quoteId: string; key: string } | null>(null);
  const [notice, setNotice] = React.useState<BillingNotice | null>(null);
  const [isOpeningCheckout, setIsOpeningCheckout] = React.useState(false);

  // One idempotency key per attempt at a given quote, so a double tap or a
  // retry after a network error can't start two autopays.
  function idempotencyKeyFor(quoteId: string) {
    if (attemptRef.current?.quoteId !== quoteId) {
      attemptRef.current = { quoteId, key: buildIdempotencyKey() };
    }

    return attemptRef.current.key;
  }

  async function startCheckout(activeQuote: BillingQuoteDto) {
    const checkout = await checkoutMutation.mutateAsync({
      quoteId: activeQuote.id,
      idempotencyKey: idempotencyKeyFor(activeQuote.id),
    });

    if (checkout.token && checkout.state === 'awaiting_authorization') {
      const result = await startAutopayCheckout(checkout.token);

      // Closing the checkout or the UPI app returns here without an error.
      if (result.status === 'dismissed') {
        return;
      }
    }

    // Coming back from Status to try again is a new attempt.
    attemptRef.current = null;
    router.push(billingRoutes.status(checkout.id, 'app'));
  }

  async function handleSetUpAutopay() {
    if (!quote || isOpeningCheckout) {
      return;
    }

    setNotice(null);
    setIsOpeningCheckout(true);

    try {
      let activeQuote = quote;

      if (isQuoteExpired(activeQuote)) {
        const fresh = (await quoteQuery.refetch()).data;

        // Something the user agreed to moved: show it before asking again.
        if (!fresh || getQuoteFingerprint(fresh) !== getQuoteFingerprint(activeQuote)) {
          return;
        }

        activeQuote = fresh;
      }

      await startCheckout(activeQuote);
    } catch (error) {
      if (hasErrorCode(error, BillingErrorCode.quoteExpired)) {
        await quoteQuery.refetch();
        setNotice(billingNotices.planChanged);
      } else if (hasErrorCode(error, BillingErrorCode.planExists)) {
        const fresh = (await billing.billingQuery.refetch()).data;
        setNotice(planSetByOtherNotice(fresh?.subscription?.purchaser.name ?? null));
      } else if (hasErrorCode(error, BillingErrorCode.checkoutInProgress)) {
        const fresh = (await billing.billingQuery.refetch()).data;
        setNotice(checkoutInProgressNotice(fresh?.pendingCheckout?.startedByName ?? null));
      } else {
        setNotice(describeBillingError(error));
      }
    } finally {
      setIsOpeningCheckout(false);
    }
  }

  function handleNoticeAction(action: BillingNotice['action']) {
    if (action === 'see-plan') {
      router.replace(billingRoutes.subscription());
    } else if (action === 'review') {
      setNotice(null);
      requote.acknowledge();
    } else if (action === 'retry') {
      void handleSetUpAutopay();
    }
  }

  if (!quote || !termMonths) {
    return (
      <BillingScreen title="Review plan">
        <BillingLoadState error={quoteQuery.error} onRetry={() => void quoteQuery.refetch()} />
      </BillingScreen>
    );
  }

  const shoes = quote.deviceIds.map(id => billing.shoesById.get(id)).filter(shoe => shoe !== undefined);
  const visibleNotice = notice ?? (requote.changed ? billingNotices.planChanged : null);
  const lines = describeSchedule(quote, {
    devices: billing.overview?.devices ?? [],
    nameForDevice: billing.nameForDevice,
  });

  return (
    <BillingScreen
      footer={(
        <>
          <BillingButton
            busy={isOpeningCheckout}
            disabled={quoteQuery.isFetching}
            label="Set up autopay"
            onPress={() => {
              void handleSetUpAutopay();
            }}
          />
          <FinePrint
            segments={['Prices include GST. Cancel any time from Profile → Subscription. By continuing you agree to the Terms and Refund policy.']}
          />
        </>
      )}
      title="Review plan"
    >
      {visibleNotice ? (
        <BillingNoticeBanner
          notice={visibleNotice}
          onAction={visibleNotice.action ? () => handleNoticeAction(visibleNotice.action) : undefined}
          style={styles.notice}
        />
      ) : null}

      <BillingCard>
        <PlanHeader caption={`${formatShoeCount(quote.shoeCount)} · billed every ${formatTerm(quote.termMonths)}`} />
        <View style={styles.shoesRow}>
          <View style={styles.avatars}>
            {shoes.map((shoe, index) => (
              <View key={shoe.deviceId} style={index > 0 && styles.avatarOverlap}>
                <ShoeAvatar shoe={shoe} size={28} />
              </View>
            ))}
          </View>
          <BillingText style={styles.flex} variant="meta">{joinNames(shoes.map(shoe => shoe.name))}</BillingText>
          <TextLink label="Change" onPress={() => router.back()} />
        </View>
      </BillingCard>

      <SectionLabel>{'When you’ll pay'}</SectionLabel>
      <ChargeTimeline lines={lines} />

      {quote.requiresMandate ? (
        <InfoNote style={styles.limit}>
          <BillingText variant="meta">
            Your UPI app will show an autopay limit of <Bold>{formatRupees(quote.mandateMaxMinor)}</Bold>. We only charge the amounts above and remind you a day before each one.
          </BillingText>
        </InfoNote>
      ) : null}
    </BillingScreen>
  );
}

const styles = StyleSheet.create(theme => ({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  notice: {
    marginTop: theme.spacing[2],
    marginHorizontal: theme.spacing[4],
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
  limit: {
    marginTop: theme.spacing[3],
    marginHorizontal: theme.spacing[4],
  },
}));
