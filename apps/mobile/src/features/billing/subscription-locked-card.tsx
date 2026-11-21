import { useRouter } from 'expo-router';
import React from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { formatBillingDate, possessive } from './billing-format';
import { billingRoutes } from './billing-routes';
import { BillingButton, BillingText, IconPlate } from './billing-ui';
import type { ChildSubscriptionLock } from './use-child-subscription-lock';

function lockBody(childName: string, lock: ChildSubscriptionLock, variant: 'home' | 'history') {
  switch (lock.action) {
    case 'add-shoe':
      return `${possessive(childName)} shoe isn’t on your plan. Add it to bring back live location, history and alerts.`;
    case 'see-plan':
      return `${possessive(childName)} shoe isn’t on your family’s plan. Only ${lock.payerName ?? 'the person who pays'} can add it.`;
    case null:
      return `${possessive(childName)} shoe isn’t on a plan, so live location, history and alerts are paused.`;
    case 'choose-plan':
    default:
      if (variant === 'home' && lock.endedOn) {
        const ended = lock.endedReason === 'plan'
          ? `${possessive(childName)} plan ended on ${formatBillingDate(lock.endedOn)}.`
          : `${possessive(childName)} free month ended on ${formatBillingDate(lock.endedOn)}.`;
        return `${ended} Choose a plan and tracking comes back as soon as autopay is set up.`;
      }

      return `${possessive(childName)} shoe isn’t on a plan. Set up autopay to bring back live location, history and alerts.`;
  }
}

/**
 * Replaces a child's History or Home content when their shoe isn't covered.
 * Locks are per child: switching to a covered child shows their data as usual.
 */
export function SubscriptionLockedCard({
  childName,
  lock,
  style,
  variant,
}: {
  childName: string;
  lock: ChildSubscriptionLock;
  style?: StyleProp<ViewStyle>;
  variant: 'home' | 'history';
}) {
  const router = useRouter();
  const deviceId = lock.device?.deviceId;
  const action = lock.action === 'choose-plan'
    ? { label: 'Choose a plan', onPress: () => router.push(billingRoutes.choosePlan()) }
    : lock.action === 'add-shoe'
      ? { label: `Add ${childName}`, onPress: () => router.push(billingRoutes.addShoes(deviceId)) }
      : lock.action === 'see-plan'
        ? { label: 'See plan', onPress: () => router.push(billingRoutes.subscription()) }
        : null;

  return (
    <View accessibilityLiveRegion="polite" style={[styles.card, style]}>
      <IconPlate icon="lock" size={52} tone="neutral" />
      <BillingText align="center" style={styles.title} variant="title">
        {`${possessive(childName)} tracking is paused`}
      </BillingText>
      <BillingText align="center" style={styles.body}>{lockBody(childName, lock, variant)}</BillingText>
      {action ? (
        <BillingButton
          label={action.label}
          onPress={action.onPress}
          size="small"
          style={styles.button}
          variant={lock.action === 'see-plan' ? 'secondary' : 'primary'}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create(theme => ({
  card: {
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 18,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },
  title: {
    marginTop: theme.spacing[3],
  },
  body: {
    marginTop: 6,
  },
  button: {
    alignSelf: 'stretch',
    marginTop: theme.spacing[4],
  },
}));
