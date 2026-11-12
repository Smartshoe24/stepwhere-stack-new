import { describe, expect, it } from 'vitest'
import { buildBanInput } from './admin-user-options'

describe('admin-user-options', () => {
  it('builds a never-expiring ban payload', () => {
    expect(
      buildBanInput({
        banReason: '  Abuse  ',
        expirationMode: 'never',
        customSeconds: '',
      })
    ).toEqual({
      banReason: 'Abuse',
      banExpiresIn: null,
    })
  })

  it('builds a custom-seconds ban payload', () => {
    expect(
      buildBanInput({
        banReason: '',
        expirationMode: 'custom',
        customSeconds: '3600',
      })
    ).toEqual({
      banReason: null,
      banExpiresIn: 3600,
    })
  })
})
