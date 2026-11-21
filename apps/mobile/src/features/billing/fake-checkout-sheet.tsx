import type { BillingFakeOutcome } from '@stepwhere/types';
import React from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { applyFakeBillingOutcome } from '@/lib/api-client';

import { BILLING_DEV_TOOLS_ENABLED } from './billing-dev';
import { describeBillingError } from './billing-errors';
import {
  BillingButton,
  BillingChip,
  BillingNoticeBanner,
  BillingSheet,
  BillingText,
} from './billing-ui';

// Dev builds only. Stands in for Cashfree's checkout while the server runs
// the fake provider: each button settles the pretend mandate or payment
// through the dev endpoint, then the caller polls the server as it would
// after the real SDK returns.

type FakeCheckoutRequest = { kind: 'mandate' | 'payment'; id: string };
type FakeCheckoutResult = { status: 'submitted' } | { status: 'dismissed' };
type Presenter = (request: FakeCheckoutRequest) => Promise<FakeCheckoutResult>;

let presenter: Presenter | null = null;

export function presentFakeCheckout(request: FakeCheckoutRequest): Promise<FakeCheckoutResult> {
  if (!presenter) {
    return Promise.reject(new Error('The test payment sheet is not mounted.'));
  }

  return presenter(request);
}

const OUTCOMES: Record<FakeCheckoutRequest['kind'], { label: string; outcome: BillingFakeOutcome; variant: 'primary' | 'secondary' | 'danger' }[]> = {
  mandate: [
    { label: 'Approve', outcome: 'approve', variant: 'primary' },
    { label: 'Bank pending', outcome: 'bank_pending', variant: 'secondary' },
    { label: 'Decline', outcome: 'decline', variant: 'danger' },
    { label: 'Let it expire', outcome: 'expire', variant: 'secondary' },
  ],
  payment: [
    { label: 'Pay', outcome: 'pay', variant: 'primary' },
    { label: 'Fail', outcome: 'fail', variant: 'danger' },
  ],
};

/** Mounted once in the signed-in app layout; renders nothing in production. */
export function FakeCheckoutHost() {
  const [request, setRequest] = React.useState<FakeCheckoutRequest | null>(null);
  const [pendingOutcome, setPendingOutcome] = React.useState<BillingFakeOutcome | null>(null);
  const [error, setError] = React.useState<unknown>(null);
  const resolveRef = React.useRef<((result: FakeCheckoutResult) => void) | null>(null);

  React.useEffect(() => {
    if (!BILLING_DEV_TOOLS_ENABLED) {
      return;
    }

    presenter = next => new Promise<FakeCheckoutResult>((resolve) => {
      // A second request replaces an unanswered one, which counts as closed.
      resolveRef.current?.({ status: 'dismissed' });
      resolveRef.current = resolve;
      setError(null);
      setPendingOutcome(null);
      setRequest(next);
    });

    return () => {
      presenter = null;
      resolveRef.current?.({ status: 'dismissed' });
      resolveRef.current = null;
    };
  }, []);

  function finish(result: FakeCheckoutResult) {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setRequest(null);
  }

  async function handleOutcome(outcome: BillingFakeOutcome) {
    if (!request || pendingOutcome) {
      return;
    }

    setPendingOutcome(outcome);
    setError(null);

    try {
      await applyFakeBillingOutcome(request.kind, request.id, outcome, { operationName: 'applyFakeBillingOutcome' });
      finish({ status: 'submitted' });
    } catch (nextError) {
      setError(nextError);
    } finally {
      setPendingOutcome(null);
    }
  }

  if (!BILLING_DEV_TOOLS_ENABLED) {
    return null;
  }

  return (
    <BillingSheet onClose={() => finish({ status: 'dismissed' })} visible={request !== null}>
      <View style={styles.header}>
        <BillingText variant="title">Test payment</BillingText>
        <BillingChip label="Dev build" tone="amber" />
      </View>
      <BillingText style={styles.body}>
        {request?.kind === 'payment'
          ? 'Pretend to pay this one-off payment. Nothing is charged.'
          : 'Pretend to answer the autopay request in a UPI app. Nothing is charged.'}
      </BillingText>
      {error ? <BillingNoticeBanner notice={describeBillingError(error)} style={styles.error} /> : null}
      <View style={styles.actions}>
        {(request ? OUTCOMES[request.kind] : []).map(option => (
          <BillingButton
            busy={pendingOutcome === option.outcome}
            disabled={pendingOutcome !== null && pendingOutcome !== option.outcome}
            key={option.outcome}
            label={option.label}
            onPress={() => {
              void handleOutcome(option.outcome);
            }}
            variant={option.variant}
          />
        ))}
        <BillingButton label="Close without answering" onPress={() => finish({ status: 'dismissed' })} size="small" variant="secondary" />
      </View>
    </BillingSheet>
  );
}

const styles = StyleSheet.create(theme => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[3],
  },
  body: {
    marginTop: theme.spacing[2],
  },
  error: {
    marginTop: theme.spacing[3],
  },
  actions: {
    marginTop: theme.spacing[4],
    gap: theme.spacing[2],
  },
}));
