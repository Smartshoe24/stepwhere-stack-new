import type { BillingCheckoutDto } from '@stepwhere/types';
import { useQueryClient } from '@tanstack/react-query';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ShoeLoader } from '@/components/loading/shoe-loader';
import { type BillingNotice, billingNotices } from '@/features/billing/billing-errors';
import {
  formatBillingDate,
  formatRelativeBillingDate,
  formatRupees,
  joinNames,
} from '@/features/billing/billing-format';
import { getFirstCharge } from '@/features/billing/billing-quote';
import { type BillingReturnTo, billingRoutes } from '@/features/billing/billing-routes';
import {
  BillingButton,
  BillingCard,
  BillingChip,
  BillingListRow,
  BillingLoadState,
  BillingText,
  Bold,
  IconPlate,
  InfoNote,
  ShoeAvatar,
  TextLink,
} from '@/features/billing/billing-ui';
import { clearSubscriptionRequired } from '@/features/billing/subscription-lock';
import { type BillingShoe, useBilling } from '@/features/billing/use-billing';
import { invalidateBillingDependents, useBillingCheckoutQuery } from '@/query/hooks';

// Never trusts the payment SDK's callback: this screen polls
// GET /billing/checkout/{id}, which re-checks the provider, until the server
// says the autopay is active, waiting on the bank, or failed.

function failureNotice(checkout: BillingCheckoutDto): BillingNotice {
  if (checkout.state === 'expired' || checkout.failureReason === 'expired') {
    return billingNotices.expired;
  }

  switch (checkout.failureReason) {
    case 'provider_error':
      return billingNotices.network;
    case 'superseded':
      return {
        body: 'A newer autopay request replaced this one. You haven’t been charged.',
        icon: 'refresh',
        title: 'This request was replaced',
        tone: 'neutral',
      };
    case 'declined':
    default:
      return billingNotices.declined;
  }
}

export default function BillingStatusScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ checkoutId?: string; returnTo?: string }>();
  const returnTo: BillingReturnTo = params.returnTo === 'subscription' ? 'subscription' : 'app';
  const checkoutQuery = useBillingCheckoutQuery(params.checkoutId ?? null);
  const checkout = checkoutQuery.data;
  const billing = useBilling();
  const state = checkout?.state;

  React.useEffect(() => {
    if (state === 'completed' || state === 'bank_pending') {
      invalidateBillingDependents(queryClient);
    }

    if (state === 'completed') {
      clearSubscriptionRequired();
    }
  }, [queryClient, state]);

  // Done returns to wherever the flow started: the app (Profile, a banner or
  // a locked screen) or the Subscription screen.
  function handleDone() {
    if (returnTo === 'subscription') {
      router.dismissTo(billingRoutes.subscription());
    } else if (router.canDismiss()) {
      router.dismissAll();
    } else {
      router.replace('/home' as Href);
    }
  }

  function handleRetry() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(returnTo === 'subscription' ? billingRoutes.subscription() : billingRoutes.choosePlan());
    }
  }

  const quoteShoes = (checkout?.quote?.deviceIds ?? [])
    .map(id => billing.shoesById.get(id))
    .filter((shoe): shoe is BillingShoe => shoe !== undefined);
  const names = joinNames(quoteShoes.map(shoe => shoe.name));

  if (!checkout) {
    return (
      <StatusLayout>
        {checkoutQuery.error ? (
          <BillingLoadState error={checkoutQuery.error} onRetry={() => void checkoutQuery.refetch()} />
        ) : (
          <SettingUp names={names} />
        )}
      </StatusLayout>
    );
  }

  switch (checkout.state) {
    case 'awaiting_authorization':
      return (
        <StatusLayout bottom={<BillingText align="center" variant="caption">{'You can leave this screen. We’ll send a notification when it’s done.'}</BillingText>}>
          <SettingUp names={names} />
        </StatusLayout>
      );
    case 'bank_pending':
      return (
        <StatusLayout
          bottom={(
            <>
              <BillingButton label="Back to app" onPress={handleDone} variant="secondary" />
              <View style={styles.centerLink}>
                <TextLink label="Use UPI instead" muted onPress={handleRetry} />
              </View>
            </>
          )}
        >
          <IconPlate icon="bank" size={88} tone="amber" />
          <BillingText align="center" style={styles.title} variant="headline">Waiting for your bank</BillingText>
          <BillingText align="center" style={styles.body}>
            {'Net banking autopay takes 1–2 working days to approve. We’ll send a notification as soon as it’s done.'}
          </BillingText>
          {checkout.kind === 'new_plan' && checkout.quote && !checkout.quote.coverageStartsNow && names ? (
            <InfoNote style={styles.fullWidth}>
              {`${names} ${quoteShoes.length === 1 ? 'stays on the' : 'stay on their'} free month meanwhile.`}
            </InfoNote>
          ) : null}
        </StatusLayout>
      );
    case 'completed':
      return <Success checkout={checkout} onDone={handleDone} shoes={quoteShoes} />;
    case 'failed':
    case 'expired':
    case 'abandoned':
    default: {
      const notice = failureNotice(checkout);
      return (
        <StatusLayout
          bottom={(
            <>
              {notice.actionLabel ? <BillingButton label={notice.actionLabel} onPress={handleRetry} /> : null}
              <BillingButton label={notice.actionLabel ? 'Back to app' : 'Done'} onPress={handleDone} variant="secondary" />
            </>
          )}
        >
          <IconPlate icon={notice.icon} size={88} tone={notice.tone} />
          <BillingText align="center" style={styles.title} variant="headline">{notice.title}</BillingText>
          <BillingText align="center" style={styles.body}>{notice.body}</BillingText>
        </StatusLayout>
      );
    }
  }
}

function SettingUp({ names }: { names: string }) {
  const { theme } = useUnistyles();

  return (
    <>
      <ShoeLoader size={96} />
      <BillingText align="center" style={styles.title} variant="headline">Setting up autopay</BillingText>
      <BillingText align="center" style={styles.body}>
        Confirming with your bank. This usually takes a few seconds.
      </BillingText>
      <BillingCard flush style={styles.card}>
        <BillingListRow leading={<IconPlate icon="check" tone="green" />} title="Approved in your payment app" />
        <BillingListRow
          leading={(
            <View style={styles.spinnerPlate}>
              <ActivityIndicator color={theme.colors.navActive} size="small" />
            </View>
          )}
          showDivider
          subtitle={names || null}
          title="Confirming with your bank"
        />
      </BillingCard>
    </>
  );
}

function Success({ checkout, onDone, shoes }: { checkout: BillingCheckoutDto; onDone: () => void; shoes: BillingShoe[] }) {
  const quote = checkout.quote;
  const doneButton = <BillingButton label="Done" onPress={onDone} />;

  if (checkout.kind === 'replace_mandate' || !quote) {
    return (
      <StatusLayout bottom={doneButton}>
        <IconPlate icon="check" size={88} tone="green" />
        <BillingText align="center" style={styles.title} variant="headline">Autopay is set up</BillingText>
        <BillingText align="center" style={styles.body}>
          Your next payments use the new autopay. The old one is cancelled.
        </BillingText>
      </StatusLayout>
    );
  }

  const first = getFirstCharge(quote);
  const coveredChip = <BillingChip label="Covered" tone="green" />;

  if (quote.coverageStartsNow) {
    const when = first ? formatRelativeBillingDate(first.on) : null;
    const isTomorrow = when === 'Tomorrow';

    return (
      <StatusLayout bottom={doneButton}>
        <IconPlate icon="check" size={88} tone="green" />
        <BillingText align="center" style={styles.title} variant="headline">Tracking is back on</BillingText>
        <BillingText align="center" style={styles.body}>
          {`${joinNames(shoes.map(shoe => shoe.name))} ${shoes.length === 1 ? 'is' : 'are'} covered from now.`}
          {first ? (
            <>
              {' The first charge of '}<Bold>{formatRupees(first.amountMinor)}</Bold>
              {isTomorrow ? ` goes through tomorrow, ${formatBillingDate(first.on)}.` : ` goes through on ${formatBillingDate(first.on)}.`}
            </>
          ) : null}
        </BillingText>
        <BillingCard flush style={styles.card}>
          {shoes.map((shoe, index) => (
            <BillingListRow
              key={shoe.deviceId}
              leading={<ShoeAvatar shoe={shoe} />}
              showDivider={index > 0}
              subtitle={`Covered until ${formatBillingDate(quote.periodEndsAt)}`}
              title={shoe.name}
              trailing={coveredChip}
            />
          ))}
        </BillingCard>
        <BillingText align="center" style={styles.caption} variant="caption">
          {isTomorrow
            ? 'If tomorrow’s charge fails, tracking pauses again and we’ll let you know.'
            : 'If the first charge fails, tracking pauses again and we’ll let you know.'}
        </BillingText>
      </StatusLayout>
    );
  }

  return (
    <StatusLayout bottom={doneButton}>
      <IconPlate icon="check" size={88} tone="green" />
      <BillingText align="center" style={styles.title} variant="headline">Autopay is set up</BillingText>
      <BillingText align="center" style={styles.body}>
        Your plan starts on <Bold>{formatBillingDate(quote.startsAt)}</Bold>. Nothing changes until then.
      </BillingText>
      <BillingCard flush style={styles.card}>
        {shoes.map((shoe, index) => (
          <BillingListRow
            key={shoe.deviceId}
            leading={<ShoeAvatar shoe={shoe} />}
            showDivider={index > 0}
            subtitle={shoe.device.coverage === 'trial'
              ? `Free until ${formatBillingDate(shoe.device.trialEndsAt)}, then on the plan`
              : `Covered until ${formatBillingDate(quote.periodEndsAt)}`}
            title={shoe.name}
            trailing={coveredChip}
          />
        ))}
        {first ? (
          <BillingListRow
            leading={<IconPlate icon="calendar" tone="neutral" />}
            showDivider
            subtitle={'We’ll remind you the day before'}
            title={`First charge ${formatRupees(first.amountMinor)} on ${formatBillingDate(first.on)}`}
          />
        ) : null}
      </BillingCard>
    </StatusLayout>
  );
}

/** Full-screen, centred result layout with actions pinned to the bottom. */
function StatusLayout({ bottom, children }: { bottom?: React.ReactNode; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { rt } = useUnistyles();

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <StatusBar style={rt.themeName === 'dark' ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
      {bottom ? <View style={styles.bottom(Math.max(insets.bottom, 16))}>{bottom}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create(theme => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingTop: 64,
    paddingHorizontal: 22,
    paddingBottom: theme.spacing[6],
  },
  title: {
    marginTop: theme.spacing[5],
  },
  body: {
    marginTop: theme.spacing[2],
  },
  caption: {
    marginTop: 14,
    paddingHorizontal: 10,
  },
  card: {
    alignSelf: 'stretch',
    marginTop: 22,
    marginHorizontal: 0,
  },
  fullWidth: {
    alignSelf: 'stretch',
    marginTop: 22,
  },
  spinnerPlate: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceMuted,
  },
  centerLink: {
    alignItems: 'center',
    marginTop: theme.spacing[2],
  },
  bottom: (bottomInset: number) => ({
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
    paddingBottom: bottomInset + theme.spacing[2],
  }),
}));
