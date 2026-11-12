import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { signOut } from '@/lib/api-client'
import { clearSessionQuery } from '@/features/auth/session'
import { ConfirmDialog } from '@/components/confirm-dialog'

interface SignOutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SignOutDialog({ open, onOpenChange }: SignOutDialogProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [isLoading, setIsLoading] = useState(false)

  const handleSignOut = async () => {
    setIsLoading(true)

    try {
      await signOut({ suppressUnauthorized: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to sign out.')
      setIsLoading(false)
      return
    }

    clearSessionQuery(queryClient)
    navigate({
      to: '/sign-in',
      search: { redirect: location.href },
      replace: true,
    })
    setIsLoading(false)
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title='Sign out'
      desc='Are you sure you want to sign out? You will need to sign in again to access your account.'
      confirmText='Sign out'
      destructive
      isLoading={isLoading}
      handleConfirm={handleSignOut}
      className='sm:max-w-sm'
    />
  )
}
