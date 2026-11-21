const childHistoryQueryKey = (childId: string, timezone: string) => [
  'child-history',
  childId,
  timezone,
] as const;

export const queryKeys = {
  currentProfile: ['me'] as const,
  overview: (organizationId: string | null | undefined) => ['overview', organizationId ?? 'anonymous'] as const,
  childDetail: (childId: string) => ['child-detail', childId] as const,
  activeChildShare: (childId: string) => ['active-child-share', childId] as const,
  childActivity: (
    childId: string,
    period: string,
    startDate: string,
    endDate: string,
    timezone: string,
  ) => ['child-activity', childId, period, startDate, endDate, timezone] as const,
  childHistory: childHistoryQueryKey,
  childHistoryRange: (childId: string, timezone: string) => [
    ...childHistoryQueryKey(childId, timezone),
    'range',
  ] as const,
  childHistoryDay: (childId: string, date: string, timezone: string) => [
    ...childHistoryQueryKey(childId, timezone),
    'day',
    date,
  ] as const,
  familyMembers: (organizationId: string | null | undefined) => ['family-members', organizationId ?? 'anonymous'] as const,
  unreadNotificationCount: (organizationId: string | null | undefined) => ['notification-unread-count', organizationId ?? 'anonymous'] as const,
  notifications: (scope: string) => ['notifications', scope] as const,
  // Everything billing shares the 'billing' prefix so a payment can refresh it
  // in one invalidation.
  billing: ['billing'] as const,
  billingOverview: (organizationId: string | null | undefined) => ['billing', 'overview', organizationId ?? 'anonymous'] as const,
  billingCharges: (organizationId: string | null | undefined) => ['billing', 'charges', organizationId ?? 'anonymous'] as const,
  billingCheckout: (checkoutId: string) => ['billing', 'checkout', checkoutId] as const,
  billingQuote: (
    organizationId: string | null | undefined,
    kind: string,
    deviceIds: readonly string[],
    termMonths: number | null,
  ) => ['billing', 'quote', organizationId ?? 'anonymous', kind, [...deviceIds].sort().join(','), termMonths ?? 0] as const,
  childTrail: (
    childId: string,
    distanceMeters: number,
    geometry: string,
  ) => ['child-trail', childId, distanceMeters, geometry] as const,
} as const;
