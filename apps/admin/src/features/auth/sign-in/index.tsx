import { useSearch } from '@tanstack/react-router'
import { AuthLayout } from '../auth-layout'
import { UserAuthForm } from './components/user-auth-form'

export function SignIn() {
  const { redirect } = useSearch({ from: '/(auth)/sign-in' })

  return (
    <AuthLayout
      title='Sign in'
      description='Use your Stepwhere admin email and password.'
      footer='Need access? Ask an existing Stepwhere admin to create or enable your account.'
    >
      <UserAuthForm redirectTo={redirect} />
    </AuthLayout>
  )
}
