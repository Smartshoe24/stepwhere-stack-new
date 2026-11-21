import type { BillingDeviceDto, BillingOverviewDto } from '@stepwhere/types';
import React from 'react';

import { useAuth } from '@/features/auth/use-auth';
import { type AvatarTone, getAvatarTone } from '@/features/overview/overview-ui';
import { useBillingOverviewQuery, useOverviewQuery } from '@/query/hooks';

import { isBillingDisabledError } from './billing-errors';

/** A shoe as billing screens show it: its child's name and avatar, or "Spare shoe". */
export type BillingShoe = {
  deviceId: string;
  device: BillingDeviceDto;
  name: string;
  child: { id: string; initials: string; avatarUrl: string | null; avatarTone: AvatarTone } | null;
};

const SPARE_SHOE_NAME = 'Spare shoe';

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

/**
 * The billing overview plus the family's children, joined so every billing
 * surface can name shoes the way the rest of the app names children.
 */
export function useBilling(options?: { refetchInterval?: number | false }) {
  const auth = useAuth();
  const organizationId = auth.user?.family.organization?.id ?? null;
  const billingQuery = useBillingOverviewQuery(organizationId, options);
  const overviewQuery = useOverviewQuery(organizationId);
  const overview: BillingOverviewDto | null = billingQuery.data ?? null;
  const children = overviewQuery.data?.children;

  const shoes = React.useMemo<BillingShoe[]>(() => {
    if (!overview) {
      return [];
    }

    const childrenById = new Map((children ?? []).map(child => [child.id, child]));

    return overview.devices.map((device) => {
      const child = device.childId ? childrenById.get(device.childId) ?? null : null;

      return {
        deviceId: device.deviceId,
        device,
        name: child ? firstName(child.name) : device.displayName?.trim() || SPARE_SHOE_NAME,
        child: child
          ? { id: child.id, initials: child.initials, avatarUrl: child.avatarUrl, avatarTone: getAvatarTone(child.id) }
          : null,
      };
    });
  }, [children, overview]);

  const shoesById = React.useMemo(() => new Map(shoes.map(shoe => [shoe.deviceId, shoe])), [shoes]);
  const nameForDevice = React.useCallback(
    (deviceId: string) => shoesById.get(deviceId)?.name ?? SPARE_SHOE_NAME,
    [shoesById],
  );

  return {
    billingQuery,
    /** BILLING_DISABLED: behave exactly as before billing existed. */
    isDisabled: isBillingDisabledError(billingQuery.error),
    nameForDevice,
    organizationId,
    overview,
    shoes,
    shoesById,
    user: auth.user,
  };
}
