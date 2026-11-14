import { describe, expect, it } from 'vitest'
import {
  QA_BOARD_TEST_IDS,
  type QaBoardTestId,
  type QaSlotDto,
  type QaTestResultDto,
  type QaTestRunDto,
} from '@stepwhere/types'
import { describeSlot, formatElapsed, slotSegments } from './qa-slot-state'

const result = (
  id: QaBoardTestId,
  status: QaTestResultDto['status'],
  extra: Partial<QaTestResultDto> = {}
): QaTestResultDto => ({
  id,
  status,
  ms: null,
  data: null,
  error: null,
  progress: null,
  prompt: null,
  awaiting: null,
  startedAt: status === 'pending' ? null : '2026-10-20T10:00:00.000Z',
  finishedAt: null,
  ...extra,
})

const run = (results: QaTestResultDto[], status: QaTestRunDto['status']): QaTestRunDto => ({
  id: 'run-1',
  unitId: 'unit-1',
  stationId: 'station-1',
  stationName: 'Bench 1',
  serialPath: '/dev/ttyUSB0',
  slotId: 'slot-1',
  chipUid: '005500313434510231303739',
  firmwareVersion: 'qa-0.2.0',
  runNumber: 1,
  status,
  results,
  passed: results.filter((entry) => entry.status === 'passed').length,
  failed: results.filter((entry) => entry.status === 'failed').length,
  skipped: 0,
  startedAt: '2026-10-20T10:00:00.000Z',
  finishedAt: status === 'running' ? null : '2026-10-20T10:06:00.000Z',
})

const slot = (overrides: Partial<QaSlotDto> = {}): QaSlotDto => ({
  id: 'slot-1',
  stationId: 'station-1',
  position: 1,
  label: 'Slot 1',
  portKey: 'usb:0403:6001:A1',
  portPath: '/dev/ttyUSB0',
  portOpen: true,
  portStable: true,
  probeSerial: null,
  probePresent: false,
  probeShared: false,
  lastLineAt: null,
  activeJob: null,
  run: null,
  verdict: null,
  unit: null,
  ...overrides,
})

const all = (status: QaTestResultDto['status']) =>
  QA_BOARD_TEST_IDS.map((id) => result(id, status))

describe('describeSlot', () => {
  it('shows the running test and its step', () => {
    const gsm = QA_BOARD_TEST_IDS.indexOf('gsm')
    const results = all('pending').map((entry, index) =>
      index < gsm ? { ...entry, status: 'passed' as const } : index === gsm ? { ...entry, status: 'running' as const } : entry
    )
    const view = describeSlot(slot({ run: run(results, 'running') }))
    expect(view).toMatchObject({
      phase: 'testing',
      headline: 'GSM',
      step: { index: gsm + 1, of: QA_BOARD_TEST_IDS.length },
      passed: gsm,
    })
    expect(view.segments[gsm].status).toBe('running')
  })

  it('asks for Start when the step test waits for the operator', () => {
    const results = all('passed').map((entry) =>
      entry.id === 'steps' ? result('steps', 'running', { awaiting: 'start', prompt: 'Pick up the board' }) : entry.id === 'gps' ? result('gps', 'pending') : entry
    )
    const view = describeSlot(slot({ run: run(results, 'running') }))
    expect(view.phase).toBe('waiting')
    expect(view.needsYou?.action).toEqual({ label: 'Start', command: 'QA GO' })
    expect(view.segments.find((entry) => entry.id === 'steps')?.status).toBe('waiting')
  })

  it('offers a retry of the one failing test', () => {
    const results = all('passed').map((entry) =>
      entry.id === 'wifi' ? result('wifi', 'failed', { error: 'No access points' }) : entry
    )
    const view = describeSlot(
      slot({
        run: run(results, 'failed'),
        verdict: { status: 'failed', failing: ['wifi'], untested: [] },
      })
    )
    expect(view).toMatchObject({ phase: 'failed', headline: 'Failed: Wi-Fi scan' })
    expect(view.action).toEqual({ label: 'Retry Wi-Fi scan', command: 'QA RUN wifi' })
  })

  it('keeps an earlier failure on the bar after retrying another test', () => {
    const retry = run([result('gps', 'passed')], 'passed')
    const view = describeSlot(
      slot({ run: retry, verdict: { status: 'failed', failing: ['wifi'], untested: [] } })
    )
    const segments = slotSegments(slot({ run: retry, verdict: { status: 'failed', failing: ['wifi'], untested: [] } }))
    expect(view.phase).toBe('failed')
    expect(segments.find((entry) => entry.id === 'wifi')).toMatchObject({ status: 'failed', fromThisRun: false })
    expect(segments.find((entry) => entry.id === 'gps')).toMatchObject({ status: 'passed', fromThisRun: true })
  })

  it('passes only when the combined verdict passes', () => {
    const view = describeSlot(
      slot({ run: run(all('passed'), 'passed'), verdict: { status: 'passed', failing: [], untested: [] } })
    )
    expect(view).toMatchObject({ phase: 'passed', passed: QA_BOARD_TEST_IDS.length, failed: 0 })
  })

  it('treats a skipped step test as not finished, not passed', () => {
    const results = all('passed').map((entry) => (entry.id === 'steps' ? result('steps', 'skipped') : entry))
    const view = describeSlot(
      slot({ run: run(results, 'passed'), verdict: { status: 'pending', failing: [], untested: ['steps'] } })
    )
    expect(view).toMatchObject({ phase: 'stopped', headline: 'Not tested: Motion self-test' })
    expect(view.action?.command).toBe('QA RUN steps')
  })

  it('shows an empty slot, and says when its adapter is unplugged', () => {
    expect(describeSlot(slot()).phase).toBe('empty')
    expect(describeSlot(slot({ portPath: null, portOpen: false })).headline).toBe('Adapter unplugged')
  })
})

describe('formatElapsed', () => {
  it('formats minutes and hours', () => {
    expect(formatElapsed(65_000)).toBe('1:05')
    expect(formatElapsed(3_725_000)).toBe('1:02:05')
    expect(formatElapsed(-5)).toBe('0:00')
  })
})
