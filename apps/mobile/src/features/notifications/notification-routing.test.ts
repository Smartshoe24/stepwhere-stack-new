import { describe, expect, it } from 'vitest';

import { getChildIdFromNotificationData, isBillingNotificationData } from './notification-routing';

describe('notification routing', () => {
  it('recognises billing pushes, which carry no child', () => {
    const data = { route: '/billing', billingKey: 'charge-tomorrow:ch-1' };
    expect(isBillingNotificationData(data)).toBe(true);
    expect(getChildIdFromNotificationData(data)).toBeNull();
  });

  it('leaves geofence pushes on child routing', () => {
    const data = { childId: 'child-1', type: 'geofence_exit' };
    expect(isBillingNotificationData(data)).toBe(false);
    expect(getChildIdFromNotificationData(data)).toBe('child-1');
  });

  it('ignores missing data', () => {
    expect(isBillingNotificationData(undefined)).toBe(false);
  });
});
