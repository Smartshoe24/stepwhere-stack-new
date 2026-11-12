import { ErrorPage } from './error-page'

export function MaintenanceError() {
  return (
    <ErrorPage
      code='503'
      title='Down for maintenance'
      description='Stepwhere Admin is briefly unavailable while we deploy an update. Try again in a few minutes.'
      showNavigation={false}
    />
  )
}
