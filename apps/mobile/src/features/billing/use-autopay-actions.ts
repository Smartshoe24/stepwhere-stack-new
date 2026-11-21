import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';

import { buildIdempotencyKey } from '@/features/children/add-child-utils';
import {
  invalidateBillingDependents,
  usePayBillingChargeNowMutation,
  useResumeBillingSubscriptionMutation,
  useStartBillingAutopayMutation,
} from '@/query/hooks';

import { BillingErrorCode, type BillingNotice, describeBillingError, hasErrorCode } from './billing-errors';
import { type BillingReturnTo, billingRoutes } from './billing-routes';
import { startAutopayCheckout, startOneTimePayment } from './checkout-adapter';

/**
 * Plan actions that hand off to the payment provider: a new autopay (payment
 * method, "Set up autopay again"), resuming a cancelled plan, and paying a
 * failed charge now. Each returns a notice to show, or null.
 */
export function useAutopayActions(organizationId: string | null, returnTo: BillingReturnTo) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const autopayMutation = useStartBillingAutopayMutation();
  const resumeMutation = useResumeBillingSubscriptionMutation(organizationId);
  const payNowMutation = usePayBillingChargeNowMutation();
  const [isOpeningCheckout, setIsOpeningCheckout] = React.useState(false);

  const setUpNewAutopay = React.useCallback(async (): Promise<BillingNotice | null> => {
    setIsOpeningCheckout(true);

    try {
      const checkout = await autopayMutation.mutateAsync({ idempotencyKey: buildIdempotencyKey() });

      if (checkout.token && checkout.state === 'awaiting_authorization') {
        const result = await startAutopayCheckout(checkout.token);

        // Closing the provider's sheet is not an error; nothing changed.
        if (result.status === 'dismissed') {
          return null;
        }
      }

      router.push(billingRoutes.status(checkout.id, returnTo));
      return null;
    } catch (error) {
      return describeBillingError(error);
    } finally {
      setIsOpeningCheckout(false);
    }
  }, [autopayMutation, returnTo, router]);

  const resumePlan = React.useCallback(async (): Promise<BillingNotice | null> => {
    try {
      await resumeMutation.mutateAsync();
      return null;
    } catch (error) {
      // The old autopay is gone, so resuming needs a new one.
      if (hasErrorCode(error, BillingErrorCode.autopayRequired)) {
        return setUpNewAutopay();
      }

      return describeBillingError(error);
    }
  }, [resumeMutation, setUpNewAutopay]);

  /** Resolves `submitted` when the provider took the payment; the server confirms it. */
  const payNow = React.useCallback(async (chargeId: string): Promise<{ notice: BillingNotice | null; submitted: boolean }> => {
    setIsOpeningCheckout(true);

    try {
      const { token } = await payNowMutation.mutateAsync(chargeId);
      const result = await startOneTimePayment(token);
      invalidateBillingDependents(queryClient);
      return { notice: null, submitted: result.status === 'submitted' };
    } catch (error) {
      return { notice: describeBillingError(error), submitted: false };
    } finally {
      setIsOpeningCheckout(false);
    }
  }, [payNowMutation, queryClient]);

  return {
    isBusy: isOpeningCheckout || autopayMutation.isPending || resumeMutation.isPending || payNowMutation.isPending,
    payNow,
    resumePlan,
    setUpNewAutopay,
  };
}
