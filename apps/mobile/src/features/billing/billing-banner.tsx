import { useRouter } from 'expo-router';
import React from 'react';
import { type LayoutChangeEvent, type StyleProp, View, type ViewStyle } from 'react-native';

import { dismissBillingBannerForToday, isBillingBannerDismissedToday } from './banner-dismissal';
import { formatBillingDate, possessive } from './billing-format';
import type { RichSegment } from './billing-quote';
import { billingRoutes } from './billing-routes';
import { type HomeBanner, isHomeBannerDismissible, selectHomeBanner } from './billing-state';
import { BillingNoticeBanner } from './billing-ui';
import type { BillingNotice } from './billing-errors';
import { useBilling } from './use-billing';

type BannerCopy = Pick<BillingNotice, 'title' | 'icon' | 'tone' | 'actionLabel'> & {
  body: RichSegment[];
  href: ReturnType<typeof billingRoutes.subscription> | null;
};

function trialEndsIn(daysLeft: number) {
  if (daysLeft <= 0) {
    return 'today';
  }

  return daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`;
}

function copyFor(banner: HomeBanner): BannerCopy {
  switch (banner.kind) {
    case 'trial-ending':
      return {
        title: `${possessive(banner.childName)} free month ends ${trialEndsIn(banner.daysLeft)}`,
        body: [`Set up autopay to keep tracking ${banner.childName}. Nothing is charged until ${formatBillingDate(banner.endsOn)}.`],
        icon: 'clock',
        tone: 'amber',
        actionLabel: 'Choose a plan',
        href: billingRoutes.choosePlan(),
      };
    case 'payer-issue':
      return {
        title: 'Your autopay didn’t go through',
        body: ['Live location, history and alerts pause on ', { bold: formatBillingDate(banner.graceEndsOn) }, ' unless the payment is fixed.'],
        icon: 'alert',
        tone: 'red',
        actionLabel: 'Fix payment',
        href: billingRoutes.subscription(),
      };
    case 'other-issue': {
      const payer = banner.payerName ?? 'the payer';
      return {
        title: `${possessive(banner.payerName ?? 'The payer')} autopay didn’t go through`,
        body: [
          `The plan is on ${possessive(payer)} bank account, so only ${payer} can fix it. Tracking pauses on `,
          { bold: formatBillingDate(banner.graceEndsOn) },
          '.',
        ],
        icon: 'alert',
        tone: 'red',
        href: null,
      };
    }
    case 'grace':
    default:
      return {
        title: banner.reason === 'plan' ? 'Your plan has ended' : `${possessive(banner.childName)} free month has ended`,
        body: ['Live location, history and alerts pause on ', { bold: formatBillingDate(banner.graceEndsOn) }, '.'],
        icon: 'alert',
        tone: 'red',
        actionLabel: banner.canBuy ? (banner.reason === 'plan' ? 'Renew plan' : 'Choose a plan') : undefined,
        href: banner.canBuy ? billingRoutes.choosePlan() : null,
      };
  }
}

/**
 * Home banner, shown only when something needs doing. The free-month reminder
 * can be dismissed until the next day; payment problems can't.
 */
export function BillingBanner({
  hidden = false,
  onLayout,
  style,
}: {
  hidden?: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const router = useRouter();
  const billing = useBilling();
  const banner = selectHomeBanner(billing.overview, { nameForDevice: billing.nameForDevice });
  const bannerId = banner?.id ?? null;
  const dismissible = banner ? isHomeBannerDismissible(banner) : false;
  // The stored dismissal for the current banner; until it's read the banner
  // stays hidden so it never flashes.
  const [stored, setStored] = React.useState<{ id: string; dismissed: boolean } | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    if (!bannerId || !dismissible) {
      return;
    }

    void isBillingBannerDismissedToday(bannerId).then((dismissed) => {
      if (!cancelled) {
        setStored({ id: bannerId, dismissed });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [bannerId, dismissible]);

  const isDismissed = dismissible && (stored?.id !== bannerId || stored.dismissed);

  if (!banner || hidden || isDismissed) {
    return null;
  }

  const copy = copyFor(banner);

  return (
    <View onLayout={onLayout} style={style}>
      <BillingNoticeBanner
        notice={copy}
        onAction={copy.href ? () => router.push(copy.href!) : undefined}
        onDismiss={dismissible
          ? () => {
            setStored({ id: banner.id, dismissed: true });
            void dismissBillingBannerForToday(banner.id).catch(() => undefined);
          }
          : undefined}
      />
    </View>
  );
}
