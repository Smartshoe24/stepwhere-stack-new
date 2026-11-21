import type { BillingCheckoutTokenDto, BillingPaymentTokenDto } from '@stepwhere/types';

import { BILLING_DEV_TOOLS_ENABLED } from './billing-dev';
import { PaymentsUnavailableError } from './billing-errors';
import { presentFakeCheckout } from './fake-checkout-sheet';

/**
 * What happened on the device. `submitted` only means the user went through
 * the provider's screens, never that money moved: callers always go to the
 * status screen (or refetch) and let the server confirm with the provider.
 */
export type CheckoutResult = { status: 'submitted' } | { status: 'dismissed' };

/** Opens the provider's autopay (mandate) approval for a checkout token. */
export async function startAutopayCheckout(token: BillingCheckoutTokenDto): Promise<CheckoutResult> {
  switch (token.provider) {
    case 'fake':
      if (!BILLING_DEV_TOOLS_ENABLED) {
        throw new PaymentsUnavailableError();
      }

      return presentFakeCheckout({ kind: 'mandate', id: token.mandateId });
    case 'cashfree':
      return startCashfreeSubscription(token);
    default:
      throw new PaymentsUnavailableError();
  }
}

/** Opens a one-off payment, used by "Pay now" for a failed charge. */
export async function startOneTimePayment(token: BillingPaymentTokenDto): Promise<CheckoutResult> {
  switch (token.provider) {
    case 'fake':
      if (!BILLING_DEV_TOOLS_ENABLED) {
        throw new PaymentsUnavailableError();
      }

      return presentFakeCheckout({ kind: 'payment', id: token.paymentId });
    case 'cashfree':
      return startCashfreePayment(token);
    default:
      throw new PaymentsUnavailableError();
  }
}

// STUB: Cashfree is integrated last (plan phase 6). This will use
// `react-native-cashfree-pg-sdk`: build a `CFSubscriptionSession` from
// `sessionId`/`subscriptionId`/`environment` and call
// `CFPaymentGatewayService.doSubscriptionPayment`, resolving `submitted` from
// its verify callback and `dismissed` when the user backs out. One-off
// payments use `CFSession` + `doPayment` the same way. Not installed yet.
async function startCashfreeSubscription(
  _token: Extract<BillingCheckoutTokenDto, { provider: 'cashfree' }>,
): Promise<CheckoutResult> {
  throw new PaymentsUnavailableError();
}

async function startCashfreePayment(
  _token: Extract<BillingPaymentTokenDto, { provider: 'cashfree' }>,
): Promise<CheckoutResult> {
  throw new PaymentsUnavailableError();
}
