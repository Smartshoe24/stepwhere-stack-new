import {
  QA_UNIT_STAGES,
  type QaUnitEventDto,
  type QaUnitListItemDto,
  type QaUnitStage,
  type QaUnitStageStatus,
} from '@stepwhere/types'

export const stageLabels: Record<QaUnitStage, string> = {
  registered: 'Registered',
  qa_firmware: 'QA firmware',
  board_tests: 'Board tests',
  production_firmware: 'Prod firmware',
  functional_tests: 'Functional tests',
  assembled: 'Assembled',
  final_test: 'Final test',
  ready_to_ship: 'Ready to ship',
  shipped: 'Shipped',
  delivered: 'Delivered',
}

export const stageStatusLabels: Record<QaUnitStageStatus, string> = {
  pending: 'In progress',
  passed: 'Passed',
  failed: 'Failed',
  scrapped: 'Scrapped',
}

/** Stages an operator marks by hand. Firmware stages move when the Bench flashes. */
export const manualStages: QaUnitStage[] = [
  'board_tests',
  'functional_tests',
  'assembled',
  'final_test',
  'ready_to_ship',
  'shipped',
  'delivered',
]

export const stageOptions = QA_UNIT_STAGES.map((stage) => ({
  label: stageLabels[stage],
  value: stage,
}))

export const stageStatusOptions = (
  ['pending', 'passed', 'failed', 'scrapped'] as const
).map((status) => ({ label: stageStatusLabels[status], value: status }))

export function stageIndex(stage: QaUnitStage) {
  return QA_UNIT_STAGES.indexOf(stage)
}

export function nextStage(stage: QaUnitStage): QaUnitStage | null {
  return QA_UNIT_STAGES[stageIndex(stage) + 1] ?? null
}

/** `0055 0031 3434 5102 3130 3739` */
export function formatChipUid(uid: string) {
  return uid.match(/.{1,4}/g)?.join(' ') ?? uid
}

export function shortChipUid(uid: string) {
  return uid.slice(-8)
}

/** The IMEI is the unit's ID; before the modem reports one, the chip UID stands in. */
export function unitTitle(unit: Pick<QaUnitListItemDto, 'imei' | 'chipUid'>) {
  return unit.imei ?? `Chip …${shortChipUid(unit.chipUid)}`
}

/** When each stage was last reached, from the timeline. */
export function stageTimes(events: QaUnitEventDto[]) {
  const times = new Map<QaUnitStage, string>()
  // Events are newest first; keep the latest time per stage.
  for (const event of events) {
    if (event.stage && !times.has(event.stage)) {
      times.set(event.stage, event.createdAt)
    }
  }
  return times
}
