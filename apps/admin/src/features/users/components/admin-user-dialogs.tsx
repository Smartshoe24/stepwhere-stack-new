import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AdminUserDetailDto, AdminUserListItemDto } from '@stepwhere/types'
import { toast } from 'sonner'
import { banAdminUser, unbanAdminUser, updateAdminUser } from '@/lib/api-client'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  banExpirationOptions,
  buildBanInput,
  userRoleOptions,
  userStatusOptions,
} from '../data/admin-user-options'

const usersQueryKey = ['admin', 'users'] as const

type AdminUserDialogUser = AdminUserListItemDto | AdminUserDetailDto

type AdminUserDialogsProps = {
  accessUser: AdminUserDialogUser | null
  onAccessUserChange: (user: AdminUserDialogUser | null) => void
  banUser: AdminUserDialogUser | null
  onBanUserChange: (user: AdminUserDialogUser | null) => void
  detailUser: AdminUserDialogUser | null
  onDetailUserChange: (user: AdminUserDialogUser | null) => void
}

export function AdminUserDialogs({
  accessUser,
  onAccessUserChange,
  banUser,
  onBanUserChange,
  detailUser,
  onDetailUserChange,
}: AdminUserDialogsProps) {
  const queryClient = useQueryClient()

  const updateMutation = useMutation({
    mutationFn: (input: {
      userId: string
      role: 'user' | 'admin'
      status: 'active' | 'suspended'
    }) =>
      updateAdminUser(input.userId, {
        role: input.role,
        status: input.status,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: usersQueryKey })
      onAccessUserChange(null)
      toast.success('User access updated.')
    },
  })

  const banMutation = useMutation({
    mutationFn: async (input: {
      userId: string
      mode: 'ban' | 'unban'
      values?: {
        banReason: string
        expirationMode: (typeof banExpirationOptions)[number]['value']
        customSeconds: string
      }
    }) => {
      if (input.mode === 'unban') {
        return unbanAdminUser(input.userId)
      }

      return banAdminUser(input.userId, buildBanInput(input.values!))
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: usersQueryKey })
      onBanUserChange(null)
      toast.success(
        variables.mode === 'ban' ? 'User banned.' : 'User unbanned.'
      )
    },
  })

  return (
    <>
      <AccessDialog
        key={accessUser?.id ?? 'access-dialog'}
        open={!!accessUser}
        onOpenChange={(open) => !open && onAccessUserChange(null)}
        user={accessUser}
        onSubmit={(input) => updateMutation.mutate(input)}
        isSaving={updateMutation.isPending}
      />
      <BanDialog
        key={banUser?.id ?? 'ban-dialog'}
        open={!!banUser}
        onOpenChange={(open) => !open && onBanUserChange(null)}
        user={banUser}
        onSubmit={(input) => banMutation.mutate(input)}
        isSaving={banMutation.isPending}
      />
      <DetailDialog
        open={!!detailUser}
        onOpenChange={(open) => !open && onDetailUserChange(null)}
        user={detailUser}
      />
    </>
  )
}

type AccessDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: AdminUserDialogUser | null
  onSubmit: (input: {
    userId: string
    role: 'user' | 'admin'
    status: 'active' | 'suspended'
  }) => void
  isSaving: boolean
}

function AccessDialog({
  open,
  onOpenChange,
  user,
  onSubmit,
  isSaving,
}: AccessDialogProps) {
  const [role, setRole] = useState<'user' | 'admin'>(user?.role ?? 'user')
  const [status, setStatus] = useState<'active' | 'suspended'>(
    user?.status ?? 'active'
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader className='text-start'>
          <DialogTitle>Edit user access</DialogTitle>
          <DialogDescription>
            Update Stepwhere admin role and account status.
          </DialogDescription>
        </DialogHeader>
        {user ? (
          <div className='grid gap-4'>
            <div className='grid gap-2'>
              <Label htmlFor='user-role'>Role</Label>
              <Select
                value={role}
                onValueChange={(value) => setRole(value as 'user' | 'admin')}
              >
                <SelectTrigger id='user-role' className='w-full'>
                  <SelectValue placeholder='Select role' />
                </SelectTrigger>
                <SelectContent>
                  {userRoleOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='user-status'>Status</Label>
              <Select
                value={status}
                onValueChange={(value) =>
                  setStatus(value as 'active' | 'suspended')
                }
              >
                <SelectTrigger id='user-status' className='w-full'>
                  <SelectValue placeholder='Select status' />
                </SelectTrigger>
                <SelectContent>
                  {userStatusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!user || isSaving}
            onClick={() =>
              user &&
              onSubmit({
                userId: user.id,
                role,
                status,
              })
            }
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type BanDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: AdminUserDialogUser | null
  onSubmit: (input: {
    userId: string
    mode: 'ban' | 'unban'
    values?: {
      banReason: string
      expirationMode: (typeof banExpirationOptions)[number]['value']
      customSeconds: string
    }
  }) => void
  isSaving: boolean
}

function BanDialog({
  open,
  onOpenChange,
  user,
  onSubmit,
  isSaving,
}: BanDialogProps) {
  const [banReason, setBanReason] = useState(user?.banReason ?? '')
  const [expirationMode, setExpirationMode] =
    useState<(typeof banExpirationOptions)[number]['value']>('never')
  const [customSeconds, setCustomSeconds] = useState('')

  if (user?.banned) {
    return (
      <ConfirmDialog
        open={open}
        onOpenChange={onOpenChange}
        title='Unban user'
        desc={`Remove the Better Auth ban for ${user.displayName}.`}
        confirmText='Unban user'
        handleConfirm={() =>
          onSubmit({
            userId: user.id,
            mode: 'unban',
          })
        }
        isLoading={isSaving}
      />
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader className='text-start'>
          <DialogTitle>Ban user</DialogTitle>
          <DialogDescription>
            Block this user at the Better Auth layer.
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4'>
          <div className='grid gap-2'>
            <Label htmlFor='ban-reason'>Reason</Label>
            <Textarea
              id='ban-reason'
              value={banReason}
              onChange={(event) => setBanReason(event.target.value)}
              placeholder='Optional reason for audit trail'
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='ban-expiration'>Expiration</Label>
            <Select
              value={expirationMode}
              onValueChange={(value) =>
                setExpirationMode(
                  value as (typeof banExpirationOptions)[number]['value']
                )
              }
            >
              <SelectTrigger id='ban-expiration' className='w-full'>
                <SelectValue placeholder='Select expiration' />
              </SelectTrigger>
              <SelectContent>
                {banExpirationOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {expirationMode === 'custom' ? (
            <div className='grid gap-2'>
              <Label htmlFor='ban-custom-seconds'>Custom seconds</Label>
              <Input
                id='ban-custom-seconds'
                inputMode='numeric'
                value={customSeconds}
                onChange={(event) => setCustomSeconds(event.target.value)}
                placeholder='3600'
              />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant='destructive'
            disabled={!user || isSaving}
            onClick={() =>
              user &&
              onSubmit({
                userId: user.id,
                mode: 'ban',
                values: {
                  banReason,
                  expirationMode,
                  customSeconds,
                },
              })
            }
          >
            Ban user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type DetailDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: AdminUserDialogUser | null
}

function DetailDialog({ open, onOpenChange, user }: DetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader className='text-start'>
          <DialogTitle>User details</DialogTitle>
          <DialogDescription>
            Current Stepwhere account state and Better Auth ban fields.
          </DialogDescription>
        </DialogHeader>
        {user ? (
          <div className='grid gap-3 text-sm sm:grid-cols-2'>
            <DetailRow label='Name' value={user.displayName} />
            <DetailRow label='Phone' value={user.phoneNumber} />
            <DetailRow label='Email' value={user.email ?? 'No email'} />
            <DetailRow label='Role' value={user.role} />
            <DetailRow label='Status' value={user.status} />
            <DetailRow label='Banned' value={user.banned ? 'Yes' : 'No'} />
            <DetailRow label='Ban reason' value={user.banReason ?? 'None'} />
            <DetailRow label='Ban expires' value={user.banExpires ?? 'Never'} />
            <DetailRow
              label='Family'
              value={user.family.organization?.name ?? 'No family'}
            />
            <DetailRow
              label='Family role'
              value={user.family.memberRole ?? 'No role'}
            />
            <DetailRow
              label='Onboarding'
              value={user.onboardingCompleted ? 'Completed' : 'Incomplete'}
            />
            <DetailRow label='Created' value={user.createdAt} />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className='rounded-md bg-inset p-3 shadow-[inset_0_0_0_1px_var(--line)]'>
      <div className='text-xs text-ink-3'>{label}</div>
      <div className='mt-1 break-all font-medium'>{value}</div>
    </div>
  )
}
