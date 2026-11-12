import type { ChildHistoryEventDto, HistoryEventKind } from '@stepwhere/types';
import type { useUnistyles } from 'react-native-unistyles';

import type { AppIconName } from '@/components/ui/app-icon';

type Theme = ReturnType<typeof useUnistyles>['theme'];

/**
 * Single source of truth for event accents. The map and the timeline both call
 * this so the same event can never render in two different colors.
 */
export function getHistoryEventColor(theme: Theme, kind: HistoryEventKind, selected = false) {
  if (selected) {
    return theme.colors.history.selected;
  }

  if (kind === 'stay') {
    return theme.colors.history.stay;
  }

  if (kind === 'trip') {
    return theme.colors.history.trip;
  }

  return theme.colors.history.gap;
}

/** Matching ~12% tint, for icon chips and coverage-bar fills. */
export function getHistoryEventSoftColor(theme: Theme, kind: HistoryEventKind, selected = false) {
  if (selected) {
    return theme.colors.history.selectedSoft;
  }

  if (kind === 'stay') {
    return theme.colors.history.staySoft;
  }

  if (kind === 'trip') {
    return theme.colors.history.tripSoft;
  }

  return theme.colors.history.gapSoft;
}

export function getHistoryEventIcon(event: ChildHistoryEventDto): AppIconName {
  if (event.kind === 'stay') {
    return 'home';
  }

  if (event.kind === 'trip') {
    return event.mode === 'walking' ? 'walk' : 'navigation';
  }

  return 'signal-none';
}

/**
 * Sequential numbers for stays only, so a pin on the map can be matched to a row
 * in the list. Trips and gaps are transitions and are not numbered.
 */
export function buildStayNumbers(events: ChildHistoryEventDto[]) {
  const numbers = new Map<string, number>();
  let next = 1;

  for (const event of events) {
    if (event.kind === 'stay') {
      numbers.set(event.id, next);
      next += 1;
    }
  }

  return numbers;
}
