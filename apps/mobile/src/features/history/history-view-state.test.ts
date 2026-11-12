import type { ChildHistoryEventDto } from '@stepwhere/types';

import { describe, expect, it } from 'vitest';

import {
  resolveHistorySourceState,
  resolveHistoryViewState,
  shouldShowHistoryMap,
} from './history-view-state';

const EVENT = { id: 'a', kind: 'stay' } as unknown as ChildHistoryEventDto;

const BASE = {
  hasChild: true,
  isLoading: false,
  errorMessage: null,
  sourceState: { kind: 'ready', dataSource: 'live' } as const,
  hasHistoryRange: true,
  events: [EVENT],
  lastDataDate: null,
  selectedDate: '2026-07-25',
};

describe('resolveHistorySourceState', () => {
  it('stays pending until both responses identify their source', () => {
    expect(resolveHistorySourceState({
      dayDataSource: undefined,
      rangeDataSource: 'live',
    })).toEqual({ kind: 'pending' });
    expect(resolveHistorySourceState({
      dayDataSource: 'fixture',
      rangeDataSource: null,
    })).toEqual({ kind: 'pending' });
  });

  it('preserves matching live and fixture sources', () => {
    expect(resolveHistorySourceState({
      dayDataSource: 'live',
      rangeDataSource: 'live',
    })).toEqual({ kind: 'ready', dataSource: 'live' });
    expect(resolveHistorySourceState({
      dayDataSource: 'fixture',
      rangeDataSource: 'fixture',
    })).toEqual({ kind: 'ready', dataSource: 'fixture' });
  });

  it('rejects mixed live and fixture responses', () => {
    expect(resolveHistorySourceState({
      dayDataSource: 'fixture',
      rangeDataSource: 'live',
    })).toEqual({ kind: 'mismatch' });
  });
});

describe('resolveHistoryViewState', () => {
  it('prioritises the missing child over every other state', () => {
    expect(resolveHistoryViewState({
      ...BASE,
      hasChild: false,
      isLoading: true,
      errorMessage: 'boom',
    })).toEqual({ kind: 'no-child' });
  });

  it('surfaces an error before loading or cached content', () => {
    expect(resolveHistoryViewState({ ...BASE, isLoading: true, errorMessage: 'boom' }))
      .toEqual({ kind: 'error', message: 'boom' });
    expect(resolveHistoryViewState({
      ...BASE,
      errorMessage: 'boom',
      sourceState: { kind: 'mismatch' },
    })).toEqual({ kind: 'error', message: 'boom' });
  });

  it('loads while either source is pending or the sources mismatch', () => {
    expect(resolveHistoryViewState({
      ...BASE,
      sourceState: { kind: 'pending' },
    })).toEqual({ kind: 'loading' });
    expect(resolveHistoryViewState({
      ...BASE,
      sourceState: { kind: 'mismatch' },
    })).toEqual({ kind: 'loading' });
  });

  it('distinguishes never-any-history from an empty day', () => {
    expect(resolveHistoryViewState({ ...BASE, hasHistoryRange: false, events: [] }))
      .toEqual({ kind: 'no-history' });
    expect(resolveHistoryViewState({ ...BASE, events: [] }))
      .toEqual({ kind: 'empty-day', lastDataDate: null });
  });

  it('offers the last active day only when it differs from the selected day', () => {
    expect(resolveHistoryViewState({
      ...BASE,
      events: [],
      lastDataDate: '2026-07-20',
    })).toEqual({ kind: 'empty-day', lastDataDate: '2026-07-20' });

    expect(resolveHistoryViewState({
      ...BASE,
      events: [],
      lastDataDate: '2026-07-25',
    })).toEqual({ kind: 'empty-day', lastDataDate: null });
  });

  it('returns the events on the ready state so callers cannot render an empty list', () => {
    expect(resolveHistoryViewState(BASE)).toEqual({ kind: 'ready', events: [EVENT] });
  });
});

describe('shouldShowHistoryMap', () => {
  it('only shows the map when there is geometry to draw', () => {
    expect(shouldShowHistoryMap({ kind: 'ready', events: [EVENT] })).toBe(true);
    expect(shouldShowHistoryMap({ kind: 'empty-day', lastDataDate: null })).toBe(false);
    expect(shouldShowHistoryMap({ kind: 'loading' })).toBe(false);
  });
});
