import type { ChildHistoryEventDto, HistoryDataSource } from '@stepwhere/types';

export type HistorySourceState =
  | { kind: 'pending' }
  | { kind: 'mismatch' }
  | { kind: 'ready'; dataSource: HistoryDataSource };

export function resolveHistorySourceState(input: {
  dayDataSource: HistoryDataSource | null | undefined;
  rangeDataSource: HistoryDataSource | null | undefined;
}): HistorySourceState {
  if (!input.dayDataSource || !input.rangeDataSource) {
    return { kind: 'pending' };
  }

  if (input.dayDataSource !== input.rangeDataSource) {
    return { kind: 'mismatch' };
  }

  return { kind: 'ready', dataSource: input.dayDataSource };
}

/**
 * Replaces the old `stateLabel: string | null`, which doubled as a boolean flag,
 * display copy, and control flow (`stateLabel === 'No history yet.'`).
 */
export type HistoryViewState =
  | { kind: 'no-child' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'no-history' }
  | { kind: 'empty-day'; lastDataDate: string | null }
  | { kind: 'ready'; events: ChildHistoryEventDto[] };

export function resolveHistoryViewState(input: {
  hasChild: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  sourceState: HistorySourceState;
  hasHistoryRange: boolean;
  events: ChildHistoryEventDto[];
  lastDataDate: string | null;
  selectedDate: string;
}): HistoryViewState {
  if (!input.hasChild) {
    return { kind: 'no-child' };
  }

  if (input.errorMessage) {
    return { kind: 'error', message: input.errorMessage };
  }

  if (input.isLoading || input.sourceState.kind !== 'ready') {
    return { kind: 'loading' };
  }

  if (!input.hasHistoryRange) {
    return { kind: 'no-history' };
  }

  if (input.events.length === 0) {
    return {
      kind: 'empty-day',
      // Only offer the jump if it goes somewhere other than where we already are.
      lastDataDate: input.lastDataDate && input.lastDataDate !== input.selectedDate
        ? input.lastDataDate
        : null,
    };
  }

  return { kind: 'ready', events: input.events };
}

/** The map is only meaningful once there is geometry to draw. */
export function shouldShowHistoryMap(state: HistoryViewState) {
  return state.kind === 'ready';
}
