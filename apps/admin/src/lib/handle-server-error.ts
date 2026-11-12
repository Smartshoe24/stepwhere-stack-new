import { toast } from 'sonner'
import { ApiError, ApiNetworkError, ApiTimeoutError } from './api-client'

export function handleServerError(error: unknown) {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log(error)
  }

  let errMsg = 'Something went wrong!'

  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    Number(error.status) === 204
  ) {
    errMsg = 'No content.'
  }

  if (error instanceof ApiError) {
    errMsg = error.message
  }

  if (error instanceof ApiNetworkError) {
    errMsg = error.message
  }

  if (error instanceof ApiTimeoutError) {
    errMsg = error.message
  }

  toast.error(errMsg)
}
