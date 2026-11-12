import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { authClient } from '@/lib/auth-client'
import { getSession, signOut } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/password-input'
import { clearSessionQuery, sessionQueryKey } from '@/features/auth/session'

const formSchema = z.object({
  email: z.email({
    error: (iss) => (iss.input === '' ? 'Please enter your email.' : undefined),
  }),
  password: z.string().min(1, 'Please enter your password.'),
})

interface UserAuthFormProps extends React.HTMLAttributes<HTMLFormElement> {
  redirectTo?: string
}

export function UserAuthForm({
  className,
  redirectTo,
  ...props
}: UserAuthFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  async function onSubmit(data: z.infer<typeof formSchema>) {
    setIsLoading(true)

    try {
      const result = await authClient.signIn.email({
        email: data.email.trim().toLowerCase(),
        password: data.password,
        rememberMe: true,
      })

      if (result.error) {
        throw new Error(result.error.message ?? 'Unable to sign in.')
      }

      const session = await getSession()

      if (!session.user) {
        throw new Error('Unable to verify the signed-in session.')
      }

      if (session.user.role !== 'admin') {
        try {
          await signOut({ suppressUnauthorized: true })
        } catch {
          // Ignore sign-out failures while rejecting a non-admin session.
        }

        clearSessionQuery(queryClient)
        navigate({ to: '/403' })
        return
      }

      queryClient.setQueryData(sessionQueryKey, session)
      toast.success('Signed in.')
      navigate({ to: redirectTo ?? '/' })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to sign in.'
      form.setError('password', { message })
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        autoComplete='on'
        method='post'
        className={cn('grid gap-3', className)}
        {...props}
      >
        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  autoComplete='username'
                  autoCapitalize='none'
                  spellCheck={false}
                  placeholder='admin@example.com'
                  type='email'
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='password'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <PasswordInput
                  {...field}
                  autoComplete='current-password'
                  placeholder='************'
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type='submit'
          size='lg'
          className='mt-2 w-full'
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className='animate-spin' /> : <LogIn />}
          Sign in
        </Button>
      </form>
    </Form>
  )
}
