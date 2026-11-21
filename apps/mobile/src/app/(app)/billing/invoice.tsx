import type { BillingChargeDto } from '@stepwhere/types';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { formatBillingDateWithYear, formatRupeesExact } from '@/features/billing/billing-format';
import {
  BillingButton,
  BillingCard,
  BillingLoadState,
  BillingScreen,
  BillingText,
  SectionLabel,
} from '@/features/billing/billing-ui';
import { useBilling } from '@/features/billing/use-billing';
import { useBillingChargesQuery } from '@/query/hooks';

function taxRate(taxMinor: number, taxableMinor: number) {
  if (taxableMinor <= 0) {
    return '';
  }

  // Rates are whole percents (9% each for CGST and SGST, 18% IGST).
  return ` ${Math.round((taxMinor / taxableMinor) * 100)}%`;
}

function paidBy(charge: BillingChargeDto) {
  if (charge.status === 'failed') {
    return 'Not paid';
  }

  const via = charge.kind === 'one_time' ? '' : ' autopay';

  switch (charge.method.kind) {
    case 'upi':
      return `Paid by UPI${via}`;
    case 'card':
      return `Paid by card${via}`;
    case 'enach':
      return `Paid by net banking${via}`;
    default:
      return 'Paid';
  }
}

function Line({ label, value, total = false }: { label: string; value: string; total?: boolean }) {
  return (
    <View style={[styles.line, total && styles.totalLine]}>
      <Text style={styles.label(total)}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export default function InvoiceScreen() {
  const params = useLocalSearchParams<{ chargeId?: string }>();
  const billing = useBilling();
  const chargesQuery = useBillingChargesQuery(billing.organizationId);
  const charge = chargesQuery.data?.charges.find(entry => entry.id === params.chargeId) ?? null;
  const invoice = charge?.invoice ?? null;

  if (!charge) {
    return (
      <BillingScreen title="Invoice">
        <BillingLoadState error={chargesQuery.error} onRetry={() => void chargesQuery.refetch()} />
      </BillingScreen>
    );
  }

  const pdfUrl = invoice?.pdfUrl;

  return (
    <BillingScreen title="Invoice">
      <SectionLabel>{invoice ? `Invoice ${invoice.number}` : formatBillingDateWithYear(charge.paidAt ?? charge.dueOn)}</SectionLabel>
      <BillingCard style={styles.card}>
        <Line label={charge.description} value={formatRupeesExact(charge.baseMinor)} />
        {charge.creditMinor > 0 ? <Line label="Credit · free days" value={formatRupeesExact(-charge.creditMinor)} /> : null}
        {invoice ? (
          <>
            <Line label="Taxable value" value={formatRupeesExact(invoice.taxableMinor)} />
            {invoice.cgstMinor > 0 ? <Line label={`CGST${taxRate(invoice.cgstMinor, invoice.taxableMinor)}`} value={formatRupeesExact(invoice.cgstMinor)} /> : null}
            {invoice.sgstMinor > 0 ? <Line label={`SGST${taxRate(invoice.sgstMinor, invoice.taxableMinor)}`} value={formatRupeesExact(invoice.sgstMinor)} /> : null}
            {invoice.igstMinor > 0 ? <Line label={`IGST${taxRate(invoice.igstMinor, invoice.taxableMinor)}`} value={formatRupeesExact(invoice.igstMinor)} /> : null}
          </>
        ) : null}
        {charge.refundedMinor > 0 ? <Line label="Refunded" value={formatRupeesExact(-charge.refundedMinor)} /> : null}
        <Line label={paidBy(charge)} total value={formatRupeesExact(charge.amountMinor)} />
        {invoice ? (
          <BillingText style={styles.issued} variant="caption">{`Issued ${formatBillingDateWithYear(invoice.issuedAt)}`}</BillingText>
        ) : null}
        {pdfUrl ? (
          <BillingButton
            icon="download"
            label="Download PDF"
            onPress={() => {
              void WebBrowser.openBrowserAsync(pdfUrl);
            }}
            size="small"
            style={styles.download}
            variant="secondary"
          />
        ) : null}
      </BillingCard>
      {charge.failureReason ? (
        <BillingText style={styles.caption} variant="caption">{charge.failureReason}</BillingText>
      ) : null}
    </BillingScreen>
  );
}

const styles = StyleSheet.create(theme => ({
  card: {
    marginTop: theme.spacing[2],
  },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 1,
  },
  totalLine: {
    marginTop: 5,
    paddingTop: 7,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  label: (total: boolean) => ({
    flex: 1,
    color: total ? theme.colors.text : theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
    fontWeight: total ? theme.typography.weight.semibold : theme.typography.weight.regular,
  }),
  value: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
    ...theme.typography.tabular,
    fontWeight: theme.typography.weight.semibold,
    textAlign: 'right',
  },
  issued: {
    marginTop: theme.spacing[2],
  },
  download: {
    marginTop: theme.spacing[3],
  },
  caption: {
    marginTop: theme.spacing[3],
    marginHorizontal: theme.spacing[5],
  },
}));
