import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, ApiNetworkError } from './api-client'
import { handleServerError } from './handle-server-error'

const toastError = vi.hoisted(() => vi.fn())

vi.mock('sonner', () => ({
  toast: {
    error: toastError,
  },
}))

beforeEach(() => {
  vi.mocked(toastError).mockClear()
})

describe('handleServerError', () => {
  it('shows a generic message when the error is not recognised', () => {
    handleServerError(new Error('network'))

    expect(toastError).toHaveBeenCalledWith('Something went wrong!')
  })

  it('maps a plain object with status 204 to the no-content message', () => {
    handleServerError({ status: 204 })

    expect(toastError).toHaveBeenCalledWith('No content.')
  })

  it('prefers the ApiError message when available', () => {
    handleServerError(
      new ApiError(422, {
        code: 'VALIDATION_FAILED',
        message: 'Validation failed',
      })
    )

    expect(toastError).toHaveBeenCalledWith('Validation failed')
  })

  it('shows the configured api base url for network failures', () => {
    handleServerError(
      new ApiNetworkError('http://localhost:8223', new TypeError('Failed to fetch'))
    )

    expect(toastError).toHaveBeenCalledWith(
      'Unable to reach Stepwhere API at http://localhost:8223.'
    )
  })

  it('logs the error to the console in development', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const err = new Error('logged')

    handleServerError(err)

    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith(err)

    log.mockRestore()
  })

  it('does not log the error to the console in production', () => {
    vi.stubEnv('DEV', false)

    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const err = new Error('not logged')

    handleServerError(err)

    expect(log).not.toHaveBeenCalled()

    log.mockRestore()
  })
})
