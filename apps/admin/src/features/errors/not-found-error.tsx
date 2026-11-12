import { ErrorPage } from './error-page'

export function NotFoundError() {
  return (
    <ErrorPage
      code='404'
      title='Page not found'
      description="This page doesn't exist or has moved. Check the address, or head back to the overview."
    />
  )
}
