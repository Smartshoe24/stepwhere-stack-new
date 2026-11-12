import {
  QA_BOARD_TEST_IDS,
  QA_TTL_START_COMMAND,
  type QaBoardTestId,
  type QaSlotDto,
  type QaTestResultDto,
  type QaTestResultStatus,
} from '@stepwhere/types'
import { testLabel } from '@/features/qa-units/lib/qa-test-format'
import { shortChipUid } from '@/features/qa-units/lib/qa-unit-format'

/** What a slot is doing, from the operator's point of view. */
export type SlotPhase =
  | 'empty'
  | 'flashing'
  | 'testing'
  | 'waiting'
  | 'passed'
  | 'failed'
  | 'stopped'

export type SlotSegment = {
  id: QaBoardTestId
  status: QaTestResultStatus | 'waiting'
  /** The result shown for this test: from this run, or the board's earlier runs. */
  result: QaTestResultDto | null
  /** False when the result comes from an earlier run (after a retry of other tests). */
  fromThisRun: boolean
}

export type SlotAction = {
  label: string
  /** Typed into the slot's TTL port. */
  command: string
}

export type SlotView = {
  phase: SlotPhase
  /** One line: the test running now, or the outcome. */
  headline: string
  /** The running test, while there is one. */
  current: QaTestResultDto | null
  /** 1-based position of the running test in this run, and the run's length. */
  step: { index: number; of: number } | null
  segments: SlotSegment[]
  passed: number
  failed: number
  /** Shown in "Needs you" when the operator has to act at this slot. */
  needsYou: { text: string; action: SlotAction | null } | null
  /** The main button on the card and in the slot sheet. */
  action: SlotAction | null
}

const RUN_ALL: SlotAction = { label: 'Run tests', command: 'QA RUN' }
const START: SlotAction = { label: 'Start', command: QA_TTL_START_COMMAND }

/**
 * One segment per board test, in firmware order. A test this run did not cover
 * shows its latest earlier outcome, so retrying GPS still shows a Wi-Fi failure.
 */
export function slotSegments(slot: QaSlotDto): SlotSegment[] {
  const results = slot.run?.results ?? []
  const verdict = slot.verdict

  return QA_BOARD_TEST_IDS.map((id) => {
    const result = results.find((entry) => entry.id === id) ?? null
    if (result) {
      const waiting = result.status === 'running' && result.awaiting === 'start'
      return {
        id,
        status: waiting ? 'waiting' : result.status,
        result,
        fromThisRun: true,
      }
    }
    const status: QaTestResultStatus = !verdict
      ? 'pending'
      : verdict.failing.includes(id)
        ? 'failed'
        : verdict.untested.includes(id)
          ? 'pending'
          : 'passed'
    return { id, status, result: null, fromThisRun: false }
  })
}

function retryAction(ids: QaBoardTestId[]): SlotAction {
  return ids.length === 1
    ? { label: `Retry ${testLabel(ids[0])}`, command: `QA RUN ${ids[0]}` }
    : { label: 'Run all again', command: 'QA RUN' }
}

export function describeSlot(slot: QaSlotDto): SlotView {
  const run = slot.run
  const segments = slotSegments(slot)
  const passed = segments.filter((entry) => entry.status === 'passed').length
  const failed = segments.filter((entry) => entry.status === 'failed').length
  const base = { segments, passed, failed, current: null, step: null }

  const job = slot.activeJob
  if (job) {
    return {
      ...base,
      phase: 'flashing',
      headline:
        job.status === 'queued'
          ? 'Waiting for the ST-LINK'
          : job.kind === 'identify'
            ? 'Reading the chip'
            : 'Flashing',
      needsYou: null,
      action: null,
    }
  }

  if (!run) {
    return {
      ...base,
      phase: 'empty',
      headline: slot.portPath ? 'No board tested yet' : 'Adapter unplugged',
      needsYou: null,
      action: slot.portOpen ? RUN_ALL : null,
    }
  }

  if (run.status === 'running') {
    const index = run.results.findIndex((entry) => entry.status === 'running')
    const current = index === -1 ? null : run.results[index]
    const step = current ? { index: index + 1, of: run.results.length } : null

    if (current?.awaiting === 'start') {
      return {
        ...base,
        current,
        step,
        phase: 'waiting',
        headline: `${testLabel(current.id)}: press Start`,
        needsYou: {
          text: `${testLabel(current.id)} is ready. Pick up the board and press Start.`,
          action: START,
        },
        action: START,
      }
    }

    return {
      ...base,
      current,
      step,
      phase: 'testing',
      headline: current ? testLabel(current.id) : 'Starting tests',
      // Once Start is pressed the operator is already walking the board; nothing more to ask.
      needsYou: null,
      action: { label: 'Abort', command: 'QA ABORT' },
    }
  }

  if (run.status === 'aborted') {
    return {
      ...base,
      phase: 'stopped',
      headline: 'Stopped before the end',
      needsYou: null,
      action: RUN_ALL,
    }
  }

  const verdict = slot.verdict
  if (verdict?.status === 'passed' || (!verdict && run.status === 'passed')) {
    return {
      ...base,
      phase: 'passed',
      headline: `Passed all ${segments.length}`,
      needsYou: null,
      action: null,
    }
  }

  const failing = verdict?.failing.length
    ? verdict.failing
    : run.results
        .filter((entry) => entry.status === 'failed')
        .map((entry) => entry.id)

  if (failing.length > 0) {
    const first = run.results.find((entry) => entry.id === failing[0])
    const label = failing.map(testLabel).join(', ')
    const action = retryAction(failing)
    return {
      ...base,
      phase: 'failed',
      headline: `Failed: ${label}`,
      needsYou: {
        text: first?.error ? `Failed ${label}: ${first.error}` : `Failed ${label}`,
        action,
      },
      action,
    }
  }

  // Finished without failures, but a test was skipped (e.g. nobody pressed Start).
  const untested = verdict?.untested ?? []
  const label = untested.map(testLabel).join(', ')
  const action = untested.length ? retryAction(untested) : RUN_ALL
  return {
    ...base,
    phase: 'stopped',
    headline: untested.length ? `Not tested: ${label}` : 'Finished',
    needsYou: untested.length
      ? { text: `${label} not tested yet, so the board can't pass.`, action }
      : null,
    action,
  }
}

export type SlotCounts = Record<SlotPhase, number>

export function countSlotPhases(views: SlotView[]): SlotCounts {
  const counts: SlotCounts = {
    empty: 0,
    flashing: 0,
    testing: 0,
    waiting: 0,
    passed: 0,
    failed: 0,
    stopped: 0,
  }
  for (const view of views) counts[view.phase] += 1
  return counts
}

/** "1:05" for elapsed time on a card. */
export function formatElapsed(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = String(seconds % 60).padStart(2, '0')
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}`
    : `${minutes}:${rest}`
}

export function elapsedSince(iso: string | null | undefined, now: number, until?: string | null) {
  if (!iso) return null
  const end = until ? new Date(until).getTime() : now
  return formatElapsed(end - new Date(iso).getTime())
}

/** The board's public ID once known, else the chip UID. */
export function slotBoardId(slot: QaSlotDto) {
  if (slot.unit?.imei) return `IMEI …${slot.unit.imei.slice(-4)}`
  const chip = slot.unit?.chipUid ?? slot.run?.chipUid
  return chip ? `chip …${shortChipUid(chip)}` : null
}
