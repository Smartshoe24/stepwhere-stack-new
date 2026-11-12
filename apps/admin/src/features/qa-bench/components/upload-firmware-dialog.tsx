import { useState } from 'react'
import type { QaFirmwareChannel } from '@stepwhere/types'
import { cn } from '@/lib/utils'
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
import { formatBytes, guessFirmwareMeta } from '../lib/qa-bench-format'

const CHANNELS: { value: QaFirmwareChannel; label: string; help: string }[] = [
  {
    value: 'qa',
    label: 'QA firmware',
    help: 'Runs the board tests. Flashing it moves a unit to QA firmware.',
  },
  {
    value: 'production',
    label: 'Production',
    help: 'Ships to customers. Flashing it moves a unit to Prod firmware.',
  },
]

/** Confirms channel and version before a build is stored. Mount with a `key` per file. */
export function UploadFirmwareDialog({
  file,
  uploading,
  onUpload,
  onClose,
}: {
  file: File
  uploading: boolean
  onUpload: (meta: { channel: QaFirmwareChannel; version: string }) => void
  onClose: () => void
}) {
  const guess = guessFirmwareMeta(file.name)
  const [channel, setChannel] = useState<QaFirmwareChannel>(guess.channel)
  const [version, setVersion] = useState(guess.version)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader className='text-start'>
          <DialogTitle>Upload firmware</DialogTitle>
          <DialogDescription>
            <span className='font-mono'>{file.name}</span> ·{' '}
            {formatBytes(file.size)}
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4'>
          <FormField label='Channel'>
            <div className='grid grid-cols-2 gap-2' role='radiogroup'>
              {CHANNELS.map((entry) => (
                <button
                  key={entry.value}
                  type='button'
                  role='radio'
                  aria-checked={channel === entry.value}
                  onClick={() => setChannel(entry.value)}
                  className={cn(
                    'focus-trail rounded-lg px-3 py-2.5 text-start transition-colors',
                    channel === entry.value
                      ? 'bg-toggle-wash shadow-[inset_0_0_0_1px_var(--toggle)]'
                      : 'bg-canvas shadow-[inset_0_0_0_1px_var(--line)] hover:bg-white/[0.03]'
                  )}
                >
                  <span className='block text-sm font-medium text-ink'>
                    {entry.label}
                  </span>
                  <span className='mt-0.5 block text-xs text-ink-3'>
                    {entry.help}
                  </span>
                </button>
              ))}
            </div>
          </FormField>
          <FormField
            label='Version'
            htmlFor='qa-firmware-version'
            help='Shown on units flashed with this build, e.g. v1.2.'
          >
            <Input
              id='qa-firmware-version'
              value={version}
              maxLength={32}
              className='font-mono'
              placeholder='v1.2'
              onChange={(event) => setVersion(event.target.value)}
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant='ghost' onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={uploading}
            onClick={() => onUpload({ channel, version: version.trim() })}
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
