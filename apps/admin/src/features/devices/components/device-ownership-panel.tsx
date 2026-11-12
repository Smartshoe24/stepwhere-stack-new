import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AdminDeviceDetailDto } from '@stepwhere/types'
import { toast } from 'sonner'
import { releaseAdminDeviceOwnership } from '@/lib/api-client'
import { formatAdminDateTimeWithSeconds } from '@/lib/date-format'
import { handleServerError } from '@/lib/handle-server-error'
import { RecordPreviewLink } from '@/features/admin/components/record-preview-link'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

// The server rejects shorter reasons; they end up in the billing audit log.
const MIN_REASON_LENGTH = 10

type Device = Pick<
  AdminDeviceDetailDto,
  'id' | 'hardwareIdentifier' | 'activeBinding' | 'ownership'
>

/** Family ownership of the physical shoe, with support's release action. */
export function DeviceOwnershipPanel({ device }: { device: Device }) {
  const [releaseOpen, setReleaseOpen] = useState(false)
  const { ownership } = device

  if (!ownership) {
    return (
      <div className='text-sm text-ink-3'>
        No family owns this shoe. The next family to bind it claims it.
      </div>
    )
  }

  return (
    <div className='space-y-3 text-sm'>
      <div className='flex flex-wrap items-center gap-2'>
        <span className='label-caps'>Owner family</span>
        <RecordPreviewLink
          type='family'
          id={ownership.organizationId}
          label={ownership.organizationName ?? 'Unnamed family'}
        />
      </div>
      <div className='text-ink-3'>
        Claimed at {formatAdminDateTimeWithSeconds(ownership.claimedAt)}
      </div>
      {device.activeBinding ? (
        <div className='text-ink-3'>
          Unbind the shoe from {device.activeBinding.childName} before
          releasing ownership.
        </div>
      ) : null}
      <Button
        variant='outline'
        disabled={Boolean(device.activeBinding)}
        onClick={() => setReleaseOpen(true)}
      >
        Release ownership
      </Button>
      <ReleaseOwnershipDialog
        open={releaseOpen}
        onOpenChange={setReleaseOpen}
        device={device}
      />
    </div>
  )
}

export function ReleaseOwnershipDialog({
  open,
  onOpenChange,
  device,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  device: Device
}) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const trimmedReason = reason.trim()
  const familyName = device.ownership?.organizationName ?? 'the current family'

  const mutation = useMutation({
    mutationFn: () =>
      releaseAdminDeviceOwnership({
        deviceId: device.id,
        reason: trimmedReason,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'devices'] })
      setReason('')
      onOpenChange(false)
      toast.success('Ownership released. Another family can now bind this shoe.')
    },
    onError: handleServerError,
  })

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason('')
        onOpenChange(next)
      }}
      title='Release ownership?'
      desc={
        <div className='space-y-2'>
          <p>
            Frees {device.hardwareIdentifier} so a different family can bind
            it. {familyName} keeps its history, but its coverage on this shoe
            ends now.
          </p>
        </div>
      }
      confirmText='Release ownership'
      destructive
      isLoading={mutation.isPending}
      disabled={trimmedReason.length < MIN_REASON_LENGTH}
      handleConfirm={() => mutation.mutate()}
    >
      <div className='grid gap-2'>
        <Label htmlFor='release-ownership-reason'>Reason</Label>
        <Textarea
          id='release-ownership-reason'
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder='e.g. Returned shoe, moving to a new family'
          maxLength={500}
        />
        <div className='text-xs text-ink-3'>
          At least {MIN_REASON_LENGTH} characters. Saved in the billing audit
          log.
        </div>
      </div>
    </ConfirmDialog>
  )
}
