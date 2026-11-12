import { ErrorPage } from './error-page'

export function UnauthorisedError() {
  return (
    <ErrorPage
      code='401'
      title='Sign in required'
      description='Your session has ended. Sign in again with your admin account to continue.'
    />
  )
}
