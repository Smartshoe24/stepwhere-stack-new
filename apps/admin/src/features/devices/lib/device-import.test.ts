import { describe, expect, it } from 'vitest'
import { parseDeviceCsv, toBulkCreateDeviceInput } from './device-import'

describe('device-import', () => {
  it('accepts valid bulk device csv', () => {
    const parsed = parseDeviceCsv(
      [
        'hardwareIdentifier,displayName,platform,status',
        'sw-dev-0001,Front Desk,android,active',
        'sw-dev-0002,,embedded,fresh',
      ].join('\n')
    )

    expect(parsed.issues).toEqual([])
    expect(parsed.rows).toEqual([
      {
        rowNumber: 2,
        hardwareIdentifier: 'SW-DEV-0001',
        displayName: 'Front Desk',
        platform: 'android',
        status: 'active',
      },
      {
        rowNumber: 3,
        hardwareIdentifier: 'SW-DEV-0002',
        displayName: null,
        platform: 'embedded',
        status: 'fresh',
      },
    ])
    expect(toBulkCreateDeviceInput(parsed.rows)).toEqual({
      devices: [
        {
          hardwareIdentifier: 'SW-DEV-0001',
          displayName: 'Front Desk',
          platform: 'android',
          status: 'active',
        },
        {
          hardwareIdentifier: 'SW-DEV-0002',
          displayName: null,
          platform: 'embedded',
          status: 'fresh',
        },
      ],
    })
  })

  it('rejects rows with missing hardware identifiers', () => {
    const parsed = parseDeviceCsv(
      ['hardwareIdentifier,displayName,platform,status', ',Label,android,active'].join(
        '\n'
      )
    )

    expect(parsed.rows).toEqual([])
    expect(parsed.issues).toEqual([
      {
        rowNumber: 2,
        message: 'hardwareIdentifier is required.',
      },
    ])
  })
})
