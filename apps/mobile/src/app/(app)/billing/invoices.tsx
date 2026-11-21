import type { BillingChargeDto } from '@stepwhere/types';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native-unistyles';

import { BillingErrorCode, hasErrorCode } from '@/features/billing/billing-errors';
import { formatBillingDateWithYear, formatRupees } from '@/features/billing/billing-format';
import { billingRoutes } from '@/features/billing/billing-routes';
import {
  BillingCard,
  BillingChip,
  BillingListRow,
  BillingLoadState,
  BillingNoticeBanner,
  BillingScreen,
  BillingText,
  IconPlate,
} from '@/features/billing/billing-ui';
import { useBilling } from '@/features/billing/use-billing';
import { useBillingChargesQuery } from '@/query/hooks';

// Charges that moved money (or tried to). Scheduled ones aren't invoices yet.
const LISTED_STATUSES = new Set<BillingChargeDto['status']>(['paid', 'refunded', 'partially_refunded', 'failed']);

function chargeChip(charge: BillingChargeDto) {
  switch (charge.status) {
    case 'refunded':
      return <BillingChip label="Refunded" tone="neutral" />;
    case 'partially_refunded':
      return <BillingChip label="Part refunded" tone="neutral" />;
    case 'failed':
      return <BillingChip label="Failed" tone="red" />;
    default:
      return null;
  }
}

export default function InvoicesScreen() {
  const router = useRouter();
  const billing = useBilling();
  const chargesQuery = useBillingChargesQuery(billing.organizationId);
  const charges = (chargesQuery.data?.charges ?? [])
    .filter(charge => LISTED_STATUSES.has(charge.status))
    .sort((left, right) => (right.paidAt ?? right.dueOn).localeCompare(left.paidAt ?? left.dueOn));
  const payerName = billing.overview?.subscription?.purchaser.name;
  const email = billing.user?.email;

  if (hasErrorCode(chargesQuery.error, BillingErrorCode.notPurchaser)) {
    return (
      <BillingScreen title="Invoices">
        <BillingNoticeBanner
          notice={{
            title: `Only ${payerName ?? 'the person who pays'} can see invoices`,
            body: 'Invoices go to the person whose autopay pays for the plan.',
            icon: 'lock',
            tone: 'neutral',
          }}
          style={styles.notice}
        />
      </BillingScreen>
    );
  }

  if (!chargesQuery.data) {
    return (
      <BillingScreen title="Invoices">
        <BillingLoadState error={chargesQuery.error} onRetry={() => void chargesQuery.refetch()} />
      </BillingScreen>
    );
  }

  return (
    <BillingScreen title="Invoices">
      {charges.length === 0 ? (
        <BillingCard>
          <BillingText variant="meta">No payments yet. Each one gets a GST invoice here.</BillingText>
        </BillingCard>
      ) : (
        <BillingCard flush>
          {charges.map((charge, index) => {
            const chip = chargeChip(charge);
            const date = formatBillingDateWithYear(charge.paidAt ?? charge.dueOn);
            const detail = [charge.description, charge.invoice?.number].filter(Boolean).join(' · ');

            return (
              <BillingListRow
                accessibilityLabel={`${date}, ${formatRupees(charge.amountMinor)}, ${detail}`}
                key={charge.id}
                leading={<IconPlate icon="document" tone="neutral" />}
                onPress={() => router.push(billingRoutes.invoice(charge.id))}
                showChevron={!chip}
                showDivider={index > 0}
                subtitle={detail}
                title={`${date} · ${formatRupees(charge.amountMinor)}`}
                trailing={chip}
              />
            );
          })}
        </BillingCard>
      )}
      {email ? (
        <BillingText style={styles.caption} variant="caption">{`We also email every invoice to ${email}.`}</BillingText>
      ) : null}
    </BillingScreen>
  );
}

const styles = StyleSheet.create(theme => ({
  notice: {
    marginTop: theme.spacing[2],
    marginHorizontal: theme.spacing[4],
  },
  caption: {
    marginTop: theme.spacing[3],
    marginHorizontal: theme.spacing[5],
  },
}));
