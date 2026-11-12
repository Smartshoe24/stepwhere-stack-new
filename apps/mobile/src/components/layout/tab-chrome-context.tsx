import React from 'react';

import { useAuth } from '@/features/auth/use-auth';
import {
  getSelectedChildIdPreference,
  setSelectedChildIdPreference,
} from '@/features/overview/overview-preferences';
import { toOverviewChildCard, type OverviewChildCard } from '@/features/overview/overview-ui';
import { useOverviewQuery, useUnreadNotificationCountQuery } from '@/query/hooks';

type TabChromeContextValue = {
  canManageChildren: boolean;
  childrenData: OverviewChildCard[];
  isSelectionLoaded: boolean;
  selectChild: (childId: string) => void;
  selectedChildId: string | null;
  unreadNotificationCount: number;
};

const TabChromeContext = React.createContext<TabChromeContextValue | null>(null);

export function TabChromeProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const organizationId = auth.user?.family.organization?.id ?? null;
  const overviewQuery = useOverviewQuery(organizationId);
  const unreadQuery = useUnreadNotificationCountQuery(organizationId);
  const [preferredChildId, setPreferredChildId] = React.useState<string | null>(null);
  const [isSelectionLoaded, setIsSelectionLoaded] = React.useState(false);
  const childrenData = React.useMemo(
    () => (overviewQuery.data?.children ?? []).map((child) => toOverviewChildCard(child)),
    [overviewQuery.data?.children],
  );
  const selectedChildId = React.useMemo(() => {
    if (preferredChildId && childrenData.some((child) => child.id === preferredChildId)) {
      return preferredChildId;
    }

    const overviewSelectedChildId = overviewQuery.data?.selectedChildId ?? null;
    if (
      overviewSelectedChildId
      && childrenData.some((child) => child.id === overviewSelectedChildId)
    ) {
      return overviewSelectedChildId;
    }

    return childrenData[0]?.id ?? null;
  }, [childrenData, overviewQuery.data?.selectedChildId, preferredChildId]);

  React.useEffect(() => {
    let cancelled = false;

    async function loadPreference() {
      try {
        const childId = await getSelectedChildIdPreference();
        if (!cancelled) {
          setPreferredChildId(childId);
        }
      } catch {
        // A missing/corrupt local preference must not block tab rendering.
      } finally {
        if (!cancelled) {
          setIsSelectionLoaded(true);
        }
      }
    }

    void loadPreference();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectChild = React.useCallback((childId: string) => {
    if (!childrenData.some((child) => child.id === childId)) {
      return;
    }

    setPreferredChildId(childId);
    void setSelectedChildIdPreference(childId).catch(() => undefined);
  }, [childrenData]);

  const value = React.useMemo<TabChromeContextValue>(() => ({
    canManageChildren: Boolean(auth.user?.family.permissions.canManageChildren),
    childrenData,
    isSelectionLoaded,
    selectChild,
    selectedChildId,
    unreadNotificationCount: unreadQuery.data?.unreadCount ?? 0,
  }), [
    auth.user?.family.permissions.canManageChildren,
    childrenData,
    isSelectionLoaded,
    selectChild,
    selectedChildId,
    unreadQuery.data?.unreadCount,
  ]);

  return <TabChromeContext.Provider value={value}>{children}</TabChromeContext.Provider>;
}

export function useTabChrome() {
  const value = React.useContext(TabChromeContext);

  if (!value) {
    throw new Error('TabChromeProvider is required within the native tabs layout.');
  }

  return value;
}
