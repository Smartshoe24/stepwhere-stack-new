import { ErrorPage } from './error-page'

type GeneralErrorProps = {
  className?: string
  minimal?: boolean
}

export function GeneralError({
  className,
  minimal = false,
}: GeneralErrorProps) {
  return (
    <ErrorPage
      code={minimal ? undefined : '500'}
      title='Something went wrong'
      description='The admin hit an unexpected error. Your data has not been changed. Try again, or go back to the overview.'
      showNavigation={!minimal}
      className={className}
    />
  )
}
