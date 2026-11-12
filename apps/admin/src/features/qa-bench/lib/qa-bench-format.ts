import {
  QA_FIRMWARE_MAX_BYTES,
  type QaBenchJobDto,
  type QaBenchJobStatus,
  type QaConnectMode,
  type QaFirmwareChannel,
  type QaFlashPhase,
  type QaSerialPortInfo,
} from '@stepwhere/types'

export const QA_BAUD_RATES = [
  9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600,
] as const

export const QA_CONNECT_MODES: {
  value: QaConnectMode
  label: string
  help: string
}[] = [
  {
    value: 'normal',
    label: 'Normal',
    help: 'Attach over SWD while the board runs.',
  },
  {
    value: 'underReset',
    label: 'Under reset',
    help: 'Holds NRST while connecting. Use when the firmware sleeps or remaps SWD pins.',
  },
  {
    value: 'hotPlug',
    label: 'Hot plug',
    help: 'Attach without halting or resetting the board.',
  },
]

export const QA_FLASH_PHASES: { value: QaFlashPhase; label: string }[] = [
  { value: 'connecting', label: 'Connect' },
  { value: 'erasing', label: 'Erase' },
  { value: 'programming', label: 'Program' },
  { value: 'verifying', label: 'Verify' },
  { value: 'resetting', label: 'Reset' },
]

export function isQaJobActive(
  job: Pick<QaBenchJobDto, 'status'> | null | undefined
) {
  return job?.status === 'queued' || job?.status === 'running'
}

export const qaJobStatusTone: Record<
  QaBenchJobStatus,
  'info' | 'success' | 'danger' | 'muted' | 'warning'
> = {
  queued: 'muted',
  running: 'info',
  succeeded: 'success',
  failed: 'danger',
  cancelled: 'warning',
}

export const qaJobStatusLabel: Record<QaBenchJobStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  succeeded: 'Passed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

export function describeQaJob(job: QaBenchJobDto) {
  if (job.kind === 'identify') return 'Identify target'
  return job.firmware ? `Flash ${job.firmware.fileName}` : 'Flash'
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function formatDuration(ms: number | null | undefined) {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms} ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)} s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${Math.round(seconds % 60)}s`
}

export function shortSha(sha256: string) {
  return `${sha256.slice(0, 8)}…${sha256.slice(-4)}`
}

export function formatUid(uid: string | null | undefined) {
  if (!uid) return null
  return uid.match(/.{1,8}/g)?.join(' ') ?? uid
}

export function describePort(port: QaSerialPortInfo) {
  const ids =
    port.vendorId && port.productId
      ? `${port.vendorId}:${port.productId}`
      : null
  return [port.manufacturer, ids].filter(Boolean).join(' · ')
}

/** Reads a .bin/.hex picked in the browser and encodes it for the upload API. */
export async function readFirmwareFile(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension !== 'bin' && extension !== 'hex') {
    throw new Error('Choose a .bin or .hex file built from apps/firmware.')
  }
  if (file.size === 0) {
    throw new Error('That file is empty.')
  }
  if (file.size > QA_FIRMWARE_MAX_BYTES) {
    throw new Error(
      `Firmware files are limited to ${formatBytes(QA_FIRMWARE_MAX_BYTES)}.`
    )
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return { fileName: file.name, contentBase64: btoa(binary) }
}

/** Colours CubeProgrammer output so errors and successes stand out in a long log. */
export function toneForProgrammerLine(
  text: string
): 'ok' | 'error' | undefined {
  if (/^error/i.test(text) || /failed|not found|no .*detected/i.test(text))
    return 'error'
  if (/verified successfully|download complete|reset is performed/i.test(text))
    return 'ok'
  return undefined
}

/**
 * Best guess at channel and version from a build's file name, e.g.
 * `stepwhere.qa.v0.3.bin` → QA, v0.3. The uploader confirms both.
 */
export function guessFirmwareMeta(fileName: string): {
  channel: QaFirmwareChannel
  version: string
} {
  const base = fileName.replace(/\.(bin|hex)$/i, '')
  const channel: QaFirmwareChannel = /(^|[^a-z])qa([^a-z]|$)/i.test(base)
    ? 'qa'
    : 'production'
  const version = /v?\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.]+)?/.exec(base)?.[0]
  return {
    channel,
    version: version ? (version.startsWith('v') ? version : `v${version}`) : '',
  }
}
