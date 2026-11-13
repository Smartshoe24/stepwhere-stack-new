import {
  QA_BOARD_TESTS,
  type QaTestResultDto,
  type QaTestRunStatus,
} from '@stepwhere/types'

type Data = Record<string, unknown>

const num = (data: Data, key: string) =>
  typeof data[key] === 'number' ? (data[key] as number) : null
const str = (data: Data, key: string) =>
  typeof data[key] === 'string' ? (data[key] as string) : null

export function formatSeconds(ms: number) {
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`
  const seconds = Math.round(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** "EF4018" → "EF 40 18", the way the memory chip's ID is usually written. */
const spacedHex = (hex: string) => hex.match(/.{1,2}/g)?.join(' ') ?? hex

export function testLabel(id: QaTestResultDto['id']) {
  return QA_BOARD_TESTS[id]?.label ?? id
}

/** One line of what the test measured, e.g. "Registered in 8.1 s · −73 dBm". */
export function summarizeResult(result: QaTestResultDto): string | null {
  const data = result.data ?? {}

  switch (result.id) {
    case 'power': {
      const mv = num(data, 'mv')
      return mv != null ? `${(mv / 1000).toFixed(2)} V` : null
    }
    case 'imu': {
      // qa-0.3.0 and later name the sensor it found; older runs only report WHO_AM_I.
      const chip = str(data, 'chip')
      const address = str(data, 'address')
      const who = str(data, 'whoAmI')
      const mg = num(data, 'restMg')
      return [
        chip ? `${chip}${address ? ` at ${address}` : ''}` : who && `WHO_AM_I ${who}`,
        mg != null && `${mg} mg at rest`,
      ]
        .filter(Boolean)
        .join(' · ')
    }
    case 'flash': {
      const id = str(data, 'jedecId')
      const expected = str(data, 'expected')
      if (!id) return null
      return id === expected || !expected
        ? `ID ${spacedHex(id)}`
        : `ID ${spacedHex(id)} · expected ${spacedHex(expected)}`
    }
    case 'modem': {
      const imei = str(data, 'imei')
      return imei ? `IMEI ${imei}` : str(data, 'revision')
    }
    case 'sim': {
      const iccid = str(data, 'iccid')
      return iccid ? `ICCID …${iccid.slice(-6)}` : null
    }
    case 'gsm': {
      const registerMs = num(data, 'registerMs')
      const rssi = num(data, 'rssiDbm')
      const limit = num(data, 'limitMs')
      return [
        registerMs != null && `Registered in ${formatSeconds(registerMs)}`,
        limit != null && `limit ${formatSeconds(limit)}`,
        rssi != null && `${rssi} dBm`,
      ]
        .filter(Boolean)
        .join(' · ')
    }
    case 'wifi': {
      const aps = num(data, 'aps')
      return aps != null ? `${aps} access point${aps === 1 ? '' : 's'}` : null
    }
    case 'cell': {
      const mcc = num(data, 'mcc')
      const mnc = num(data, 'mnc')
      const cellId = num(data, 'cellId')
      const rsrp = num(data, 'rsrpDbm')
      if (mcc == null) return null
      return [
        `${mcc}-${String(mnc ?? '').padStart(2, '0')}`,
        cellId != null && `cell ${cellId}`,
        rsrp != null && `RSRP ${rsrp} dBm`,
      ]
        .filter(Boolean)
        .join(' · ')
    }
    case 'data': {
      const ip = str(data, 'ip')
      return ip ? `IP ${ip}` : null
    }
    case 'steps': {
      const steps = num(data, 'steps')
      const target = num(data, 'target')
      // LIS2DH12 boards count with the shoe pedometer: one swing is one stride.
      const swings = num(data, 'strides')
      if (steps == null) return null
      return [
        `${steps}/${target ?? '?'} steps`,
        swings != null && `${swings} swing${swings === 1 ? '' : 's'}`,
      ]
        .filter(Boolean)
        .join(' · ')
    }
    case 'gps': {
      const fixMs = num(data, 'fixMs')
      const sats = num(data, 'satellites')
      const hdop = num(data, 'hdop')
      return [
        fixMs != null ? `Fix in ${formatSeconds(fixMs)}` : null,
        sats != null && `${sats} satellites`,
        hdop != null && `HDOP ${hdop}`,
      ]
        .filter(Boolean)
        .join(' · ')
    }
    default:
      return null
  }
}

export const runStatusTone: Record<
  QaTestRunStatus,
  'info' | 'success' | 'danger' | 'muted'
> = {
  running: 'info',
  passed: 'success',
  failed: 'danger',
  aborted: 'muted',
}

export const runStatusLabel: Record<QaTestRunStatus, string> = {
  running: 'Running',
  passed: 'Passed',
  failed: 'Failed',
  aborted: 'Aborted',
}
