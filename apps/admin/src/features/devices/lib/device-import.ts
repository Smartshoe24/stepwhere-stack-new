import type {
  AdminBulkCreateDeviceInput,
  AdminCreateDeviceInput,
} from '@stepwhere/types'

export const DEVICE_IMPORT_HEADERS = [
  'hardwareIdentifier',
  'displayName',
  'platform',
  'status',
] as const

export type ParsedDeviceImportRow = AdminCreateDeviceInput & {
  rowNumber: number
}

export type DeviceImportIssue = {
  rowNumber: number
  message: string
}

export function parseDeviceCsv(text: string) {
  const rows = parseCsvRows(text)
  const issues: DeviceImportIssue[] = []

  if (rows.length === 0) {
    return { rows: [] as ParsedDeviceImportRow[], issues }
  }

  const [headerRow, ...dataRows] = rows
  const normalizedHeaders = headerRow.map((value) => value.trim())

  for (const header of DEVICE_IMPORT_HEADERS) {
    if (!normalizedHeaders.includes(header)) {
      issues.push({
        rowNumber: 1,
        message: `Missing required header "${header}".`,
      })
    }
  }

  const headerIndex = Object.fromEntries(
    normalizedHeaders.map((header, index) => [header, index])
  ) as Record<string, number>

  const parsedRows = dataRows.flatMap((columns, index) => {
    const rowNumber = index + 2
    const hardwareIdentifier =
      columns[headerIndex.hardwareIdentifier]?.trim().toUpperCase() ?? ''
    const displayName =
      columns[headerIndex.displayName]?.trim() || null
    const platform =
      (columns[headerIndex.platform]?.trim().toLowerCase() as
        | 'android'
        | 'ios'
        | 'embedded'
        | 'unknown'
        | '') || 'unknown'
    const status =
      (columns[headerIndex.status]?.trim().toLowerCase() as
        | 'fresh'
        | 'active'
        | 'inactive'
        | 'blocked'
        | '') || 'fresh'

    if (!hardwareIdentifier) {
      issues.push({
        rowNumber,
        message: 'hardwareIdentifier is required.',
      })
      return []
    }

    if (!['android', 'ios', 'embedded', 'unknown'].includes(platform)) {
      issues.push({
        rowNumber,
        message: `Unsupported platform "${platform}".`,
      })
      return []
    }

    if (!['fresh', 'active', 'inactive', 'blocked'].includes(status)) {
      issues.push({
        rowNumber,
        message: `Unsupported status "${status}".`,
      })
      return []
    }

    return [
      {
        rowNumber,
        hardwareIdentifier,
        displayName,
        platform,
        status,
      } satisfies ParsedDeviceImportRow,
    ]
  })

  return {
    rows: parsedRows,
    issues,
  }
}

export function toBulkCreateDeviceInput(
  rows: ParsedDeviceImportRow[]
): AdminBulkCreateDeviceInput {
  return {
    devices: rows.map(({ rowNumber: _rowNumber, ...device }) => device),
  }
}

export async function readTextFile(file: File) {
  return file.text()
}

function parseCsvRows(text: string) {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentValue = ''
  let insideQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    const nextCharacter = text[index + 1]

    if (character === '"') {
      if (insideQuotes && nextCharacter === '"') {
        currentValue += '"'
        index += 1
      } else {
        insideQuotes = !insideQuotes
      }
      continue
    }

    if (character === ',' && !insideQuotes) {
      currentRow.push(currentValue)
      currentValue = ''
      continue
    }

    if ((character === '\n' || character === '\r') && !insideQuotes) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1
      }

      currentRow.push(currentValue)
      if (currentRow.some((value) => value.trim() !== '')) {
        rows.push(currentRow)
      }
      currentRow = []
      currentValue = ''
      continue
    }

    currentValue += character
  }

  currentRow.push(currentValue)
  if (currentRow.some((value) => value.trim() !== '')) {
    rows.push(currentRow)
  }

  return rows
}
