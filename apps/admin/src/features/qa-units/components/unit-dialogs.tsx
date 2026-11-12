import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  QA_UNIT_STAGES,
  type QaUnitDetailDto,
  type QaUnitStage,
  type QaUnitStageStatus,
} from '@stepwhere/types'
import { toast } from 'sonner'
import { setQaUnitStage, updateQaUnit } from '@/lib/api-client'
import { handleServerError } from '@/lib/handle-server-error'
import { adminQueryKeys } from '@/features/admin/query-keys'
import { FormField } from '@/components/patterns/key-value'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { stageLabels, stageStatusLabels } from '../lib/qa-unit-format'

export type StagePreset = {
  stage: QaUnitStage
  status: QaUnitStageStatus
  title: string
}

function useSetUnitDetail() {
  const queryClient = useQueryClient()
  return (unit: QaUnitDetailDto) => {
    queryClient.setQueryData(adminQueryKeys.qa.unit(unit.id), unit)
    void queryClient.invalidateQueries({ queryKey: adminQueryKeys.qa.units() })
    void queryClient.invalidateQueries({
      queryKey: adminQueryKeys.qa.overview(),
    })
  }
}

/** Move a unit to any stage and status, with a note for the timeline. Mount with a `key` per open. */
export function SetStageDialog({
  unit,
  preset,
  onClose,
}: {
  unit: QaUnitDetailDto
  preset: StagePreset
  onClose: () => void
}) {
  const setUnitDetail = useSetUnitDetail()
  const [stage, setStage] = useState<QaUnitStage>(preset.stage)
  const [status, setStatus] = useState<QaUnitStageStatus>(preset.status)
  const [note, setNote] = useState('')
  const noteRequired = status === 'failed' || status === 'scrapped'

  const mutation = useMutation({
    mutationFn: () =>
      setQaUnitStage(unit.id, { stage, status, note: note.trim() || null }),
    onSuccess: (updated) => {
      setUnitDetail(updated)
      toast.success(
        `${stageLabels[updated.stage]}: ${stageStatusLabels[updated.stageStatus].toLowerCase()}.`
      )
      onClose()
    },
    onError: handleServerError,
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader className='text-start'>
          <DialogTitle>{preset.title}</DialogTitle>
          <DialogDescription>
            The change and your note go on the unit&rsquo;s timeline.
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4'>
          <div className='grid grid-cols-2 gap-3'>
            <FormField label='Stage'>
              <Select
                value={stage}
                onValueChange={(value) => setStage(value as QaUnitStage)}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QA_UNIT_STAGES.map((entry) => (
                    <SelectItem key={entry} value={entry}>
                      {stageLabels[entry]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label='Status'>
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as QaUnitStageStatus)}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['pending', 'passed', 'failed', 'scrapped'] as const).map(
                    (entry) => (
                      <SelectItem key={entry} value={entry}>
                        {stageStatusLabels[entry]}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <FormField
            label='Note'
            htmlFor='qa-stage-note'
            help={
              noteRequired
                ? 'Say what failed, so whoever reworks it knows where to look.'
                : 'Optional.'
            }
          >
            <Textarea
              id='qa-stage-note'
              value={note}
              maxLength={500}
              rows={3}
              placeholder={
                noteRequired ? 'e.g. No GPS fix after 7 min, antenna loose' : ''
              }
              onChange={(event) => setNote(event.target.value)}
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant='ghost' onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={
              status === 'failed' || status === 'scrapped'
                ? 'destructive'
                : 'default'
            }
            disabled={mutation.isPending || (noteRequired && !note.trim())}
            onClick={() => mutation.mutate()}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Enter, correct or unlink the IMEI. Mount with a `key` per open. */
export function EditImeiDialog({
  unit,
  onClose,
}: {
  unit: QaUnitDetailDto
  onClose: () => void
}) {
  const setUnitDetail = useSetUnitDetail()
  const [value, setValue] = useState(unit.imei ?? '')
  const digits = value.replace(/[\s.-]/g, '')
  const looksValid = /^\d{15}$/.test(digits)

  const mutation = useMutation({
    mutationFn: (imei: string | null) => updateQaUnit(unit.id, { imei }),
    onSuccess: (updated) => {
      setUnitDetail(updated)
      toast.success(
        updated.imei ? `IMEI set to ${updated.imei}.` : 'IMEI unlinked.'
      )
      onClose()
    },
    onError: handleServerError,
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader className='text-start'>
          <DialogTitle>{unit.imei ? 'Change IMEI' : 'Enter IMEI'}</DialogTitle>
          <DialogDescription>
            The Bench reads the IMEI from the board&rsquo;s TTL output at boot.
            Enter it here when the serial console wasn&rsquo;t open, or scan the
            modem&rsquo;s label.
          </DialogDescription>
        </DialogHeader>
        <FormField
          label='IMEI'
          htmlFor='qa-unit-imei'
          help='15 digits. The last one is a check digit.'
        >
          <Input
            id='qa-unit-imei'
            value={value}
            autoFocus
            inputMode='numeric'
            className='font-mono'
            placeholder='860123456789012'
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && looksValid) mutation.mutate(digits)
            }}
          />
        </FormField>
        <DialogFooter className='sm:justify-between'>
          {unit.imei ? (
            <Button
              variant='ghost'
              className='text-breach'
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(null)}
            >
              Unlink
            </Button>
          ) : (
            <span />
          )}
          <div className='flex gap-2'>
            <Button variant='ghost' onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={
                !looksValid || mutation.isPending || digits === unit.imei
              }
              onClick={() => mutation.mutate(digits)}
            >
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
