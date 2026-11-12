import { describe, expect, it } from 'vitest'
import {
  createDeviceQrSvg,
  getDeviceQrFilename,
  getDeviceQrPayload,
} from './device-qr'

const device = {
  hardwareIdentifier: 'SW-DEV-0001',
  displayName: 'Front Desk',
} as const

describe('device-qr', () => {
  it('uses the hardware identifier as the qr payload', () => {
    expect(getDeviceQrPayload(device)).toBe('SW-DEV-0001')
  })

  it('uses the hardware identifier for the svg filename', () => {
    expect(getDeviceQrFilename(device, 'svg')).toBe('SW-DEV-0001.svg')
  })

  it('renders an svg label containing the hardware identifier metadata', () => {
    const svg = createDeviceQrSvg(device)

    expect(svg).toContain('<svg')
    expect(svg).toContain('<desc>SW-DEV-0001</desc>')
    expect(svg).toContain('SW-DEV-0001')
    expect(svg).toContain('Front Desk')
  })
})
