import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AdminChildListItemDto, AdminDeviceDto } from '@stepwhere/types'
import { toast } from 'sonner'
import {
  bindAdminDevice,
  bulkCreateAdminDevices,
  createAdminDevice,
  updateAdminDevice,
} from '@/lib/api-client'
import { EventTable } from '@/components/patterns/event-table'
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
  devicePlatformOptions,
  deviceStatusOptions,
  normalizeDeviceDraft,
} from '../data/device-options'
import {
  parseDeviceCsv,
  readTextFile,
  toBulkCreateDeviceInput,
  type ParsedDeviceImportRow,
} from '../lib/device-import'
import {
  createDeviceQrSvg,
  downloadDeviceQrPng,
  downloadDeviceQrSvg,
  downloadDeviceQrZip,
} from '../lib/device-qr'

type DeviceDialogsProps = {
  createOpen: boolean
  onCreateOpenChange: (open: boolean) => void
  editingDevice: AdminDeviceDto | null
  onEditingDeviceChange: (device: AdminDeviceDto | null) => void
  bulkOpen: boolean
  onBulkOpenChange: (open: boolean) => void
  bindingDevice: AdminDeviceDto | null
  onBindingDeviceChange: (device: AdminDeviceDto | null) => void
  qrDevice: AdminDeviceDto | null
  onQrDeviceChange: (device: AdminDeviceDto | null) => void
  children: AdminChildListItemDto[]
}

export function DeviceDialogs(props: DeviceDialogsProps) {
  return (
    <>
      <DeviceMutateDialog
        key={
          props.editingDevice?.id ??
          (props.createOpen ? 'device-create' : 'device-closed')
        }
        open={props.createOpen || !!props.editingDevice}
        onOpenChange={(open) => {
          if (!open) {
            props.onCreateOpenChange(false)
            props.onEditingDeviceChange(null)
          }
        }}
        device={props.editingDevice}
        onCreated={(device) => {
          props.onCreateOpenChange(false)
          props.onEditingDeviceChange(null)
          props.onQrDeviceChange(device)
        }}
      />
      <DeviceBulkImportDialog
        open={props.bulkOpen}
        onOpenChange={props.onBulkOpenChange}
      />
      <DeviceBindDialog
        key={props.bindingDevice?.id ?? 'bind-dialog'}
        open={!!props.bindingDevice}
        onOpenChange={(open) => !open && props.onBindingDeviceChange(null)}
        device={props.bindingDevice}
        children={props.children}
      />
      <DeviceQrDialog
        open={!!props.qrDevice}
        onOpenChange={(open) => !open && props.onQrDeviceChange(null)}
        device={props.qrDevice}
      />
    </>
  )
}

function DeviceMutateDialog({
  open,
  onOpenChange,
  device,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  device: AdminDeviceDto | null
  onCreated: (device: AdminDeviceDto) => void
}) {
  const queryClient = useQueryClient()
  const [hardwareIdentifier, setHardwareIdentifier] = useState(
    device?.hardwareIdentifier ?? ''
  )
  const [displayName, setDisplayName] = useState(device?.displayName ?? '')
  const [platform, setPlatform] = useState<
    (typeof devicePlatformOptions)[number]['value']
  >(device?.platform ?? 'unknown')
  const [status, setStatus] = useState<
    (typeof deviceStatusOptions)[number]['value']
  >(device?.status ?? 'fresh')

  const mutation = useMutation({
    mutationFn: async () => {
      const input = normalizeDeviceDraft({
        hardwareIdentifier,
        displayName,
        platform,
        status,
      })

      if (device) {
        return updateAdminDevice(device.id, input)
      }

      return createAdminDevice(input)
    },
    onSuccess: async (createdDevice) => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'devices'] })
      toast.success(device ? 'Device updated.' : 'Device created.')

      if (device) {
        onOpenChange(false)
        return
      }

      onCreated(createdDevice)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader className='text-start'>
          <DialogTitle>{device ? 'Edit device' : 'Add device'}</DialogTitle>
          <DialogDescription>
            Provision a Stepwhere device record and generate its QR label.
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4'>
          <div className='grid gap-2'>
            <Label htmlFor='device-hardware-id'>Hardware identifier</Label>
            <Input
              id='device-hardware-id'
              value={hardwareIdentifier}
              onChange={(event) =>
                setHardwareIdentifier(event.target.value.toUpperCase())
              }
              placeholder='SW-DEV-0001'
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='device-display-name'>Display name</Label>
            <Input
              id='device-display-name'
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder='Front desk device'
            />
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='grid gap-2'>
              <Label htmlFor='device-platform'>Platform</Label>
              <Select
                value={platform}
                onValueChange={(value) => setPlatform(value as typeof platform)}
              >
                <SelectTrigger id='device-platform' className='w-full'>
                  <SelectValue placeholder='Select platform' />
                </SelectTrigger>
                <SelectContent>
                  {devicePlatformOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='device-status'>Status</Label>
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as typeof status)}
              >
                <SelectTrigger id='device-status' className='w-full'>
                  <SelectValue placeholder='Select status' />
                </SelectTrigger>
                <SelectContent>
                  {deviceStatusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!hardwareIdentifier.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {device ? 'Save changes' : 'Create device'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeviceBulkImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [csvText, setCsvText] = useState('')
  const [previewRows, setPreviewRows] = useState<ParsedDeviceImportRow[]>([])
  const [issues, setIssues] = useState<
    Array<{ rowNumber: number; message: string }>
  >([])
  const [createdDevices, setCreatedDevices] = useState<AdminDeviceDto[]>([])

  const mutation = useMutation({
    mutationFn: () =>
      bulkCreateAdminDevices(toBulkCreateDeviceInput(previewRows)),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'devices'] })
      setCreatedDevices(result.created)
      setIssues(
        result.skipped.map((entry) => ({
          rowNumber: 0,
          message: `${entry.hardwareIdentifier}: ${entry.reason}`,
        }))
      )
      toast.success(
        `Created ${result.created.length} device${result.created.length === 1 ? '' : 's'}.`
      )
    },
  })

  const applyPreview = (text: string) => {
    setCsvText(text)
    const parsed = parseDeviceCsv(text)
    setPreviewRows(parsed.rows)
    setIssues(parsed.issues)
    setCreatedDevices([])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-3xl'>
        <DialogHeader className='text-start'>
          <DialogTitle>Bulk add devices</DialogTitle>
          <DialogDescription>
            Upload or paste CSV with hardwareIdentifier, displayName, platform,
            and status.
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4'>
          <div className='flex flex-wrap gap-2'>
            <Input
              type='file'
              accept='.csv,text/csv'
              onChange={async (event) => {
                const file = event.target.files?.[0]
                if (!file) return
                applyPreview(await readTextFile(file))
              }}
            />
          </div>
          <Textarea
            value={csvText}
            onChange={(event) => applyPreview(event.target.value)}
            className='min-h-40'
            placeholder='hardwareIdentifier,displayName,platform,status'
          />
          <div className='grid gap-2'>
            <div className='text-sm font-medium'>
              Preview ({previewRows.length} valid row
              {previewRows.length === 1 ? '' : 's'})
            </div>
            <div className='max-h-48 overflow-auto rounded-md bg-inset p-4 shadow-[inset_0_0_0_1px_var(--line)]'>
              <EventTable>
                <thead>
                  <tr>
                    <th>Hardware ID</th>
                    <th>Display name</th>
                    <th>Platform</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={`${row.rowNumber}-${row.hardwareIdentifier}`}>
                      <td>{row.hardwareIdentifier}</td>
                      <td>{row.displayName ?? 'No label'}</td>
                      <td>{row.platform}</td>
                      <td>{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </EventTable>
            </div>
          </div>
          {issues.length > 0 ? (
            <div className='rounded-md bg-caution-wash p-3 text-sm text-caution'>
              <div className='font-medium'>Import issues</div>
              <ul className='mt-2 space-y-1'>
                {issues.map((issue, index) => (
                  <li key={`${issue.rowNumber}-${index}`}>
                    {issue.rowNumber > 0 ? `Row ${issue.rowNumber}: ` : ''}
                    {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {createdDevices.length > 0 ? (
            <div className='flex justify-end'>
              <Button
                variant='outline'
                onClick={() => void downloadDeviceQrZip(createdDevices)}
              >
                Download created QR ZIP
              </Button>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            disabled={previewRows.length === 0 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Import devices
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeviceBindDialog({
  open,
  onOpenChange,
  device,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  device: AdminDeviceDto | null
  children: AdminChildListItemDto[]
}) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedChildId, setSelectedChildId] = useState(
    device?.activeBinding?.childId ?? ''
  )

  const visibleChildren = useMemo(() => {
    const value = search.toLowerCase().trim()
    if (!value) return children
    return children.filter((child) => child.name.toLowerCase().includes(value))
  }, [children, search])

  const mutation = useMutation({
    mutationFn: () =>
      device && selectedChildId
        ? bindAdminDevice(device.id, { childId: selectedChildId })
        : Promise.reject(new Error('Select a child first.')),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'devices'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'children'] }),
      ])
      onOpenChange(false)
      toast.success('Device binding updated.')
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader className='text-start'>
          <DialogTitle>Bind device</DialogTitle>
          <DialogDescription>
            Connect this hardware ID to a child record.
          </DialogDescription>
        </DialogHeader>
        {device ? (
          <div className='grid gap-4'>
            <div className='rounded-md bg-inset p-3 text-sm shadow-[inset_0_0_0_1px_var(--line)]'>
              <div className='font-medium'>{device.hardwareIdentifier}</div>
              <div className='text-ink-3'>
                {device.activeBinding
                  ? `Currently bound to ${device.activeBinding.childName}.`
                  : 'Currently unbound.'}
              </div>
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='child-search'>Search child</Label>
              <Input
                id='child-search'
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder='Search by child name'
              />
            </div>
            <div className='max-h-64 overflow-auto rounded-md bg-inset shadow-[inset_0_0_0_1px_var(--line)]'>
              <div className='divide-y divide-line-faint'>
                {visibleChildren.map((child) => (
                  <button
                    key={child.id}
                    type='button'
                    aria-pressed={selectedChildId === child.id}
                    className='focus-trail flex w-full items-start justify-between gap-4 p-3 text-left transition-colors hover:bg-white/[0.03] aria-pressed:bg-here-wash aria-pressed:trail-edge'
                    onClick={() => setSelectedChildId(child.id)}
                  >
                    <div>
                      <div className='font-medium'>{child.name}</div>
                      <div className='text-xs text-ink-3'>
                        {child.summary.deviceSummary?.hardwareIdentifier ??
                          'No active device'}
                      </div>
                    </div>
                    <div className='text-xs text-ink-3'>
                      {child.lifecycleStatus}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!device || !selectedChildId || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Save binding
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeviceQrDialog({
  open,
  onOpenChange,
  device,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  device: AdminDeviceDto | null
}) {
  const svgMarkup = device ? createDeviceQrSvg(device) : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader className='text-start'>
          <DialogTitle>Device QR</DialogTitle>
          <DialogDescription>
            QR data contains only the hardware identifier.
          </DialogDescription>
        </DialogHeader>
        {device ? (
          <div className='grid gap-4'>
            <div
              className='overflow-hidden rounded-md bg-white p-4 shadow-[0_0_0_1px_var(--line)]'
              dangerouslySetInnerHTML={{ __html: svgMarkup }}
            />
            <div className='flex flex-wrap gap-2'>
              <Button
                variant='outline'
                onClick={() => downloadDeviceQrSvg(device)}
              >
                Download SVG
              </Button>
              <Button
                variant='outline'
                onClick={() => void downloadDeviceQrPng(device)}
              >
                Download PNG
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
