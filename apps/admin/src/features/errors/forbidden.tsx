import { ErrorPage } from './error-page'

export function ForbiddenError() {
  return (
    <ErrorPage
      code='403'
      title='You don’t have access'
      description='Your account is signed in but isn’t an admin. Ask an existing Stepwhere admin to grant access.'
    />
  )
}
