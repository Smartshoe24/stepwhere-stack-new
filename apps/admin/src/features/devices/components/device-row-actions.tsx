import type { AdminDeviceListItemDto } from '@stepwhere/types'
import { MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import {
  downloadDeviceQrPng,
  downloadDeviceQrSvg,
} from '@/features/devices/lib/device-qr'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type DeviceRowActionsProps = {
  device: AdminDeviceListItemDto
  onEdit: (device: AdminDeviceListItemDto) => void
  onBind: (device: AdminDeviceListItemDto) => void
  onShowQr: (device: AdminDeviceListItemDto) => void
  onView: (device: AdminDeviceListItemDto) => void
  onToggleBlocked: (device: AdminDeviceListItemDto) => void
  onUnbind: (device: AdminDeviceListItemDto) => void
}

export function DeviceRowActions({
  device,
  onEdit,
  onBind,
  onShowQr,
  onView,
  onToggleBlocked,
  onUnbind,
}: DeviceRowActionsProps) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='icon' className='size-8'>
          <MoreHorizontal />
          <span className='sr-only'>Open actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-48'>
        <DropdownMenuItem onClick={() => onView(device)}>
          View device
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEdit(device)}>
          Edit device
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onBind(device)}>
          Bind to child
        </DropdownMenuItem>
        {device.activeBinding ? (
          <DropdownMenuItem onClick={() => onUnbind(device)}>
            Unbind
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => onToggleBlocked(device)}>
          {device.status === 'blocked' ? 'Unblock device' : 'Block device'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onShowQr(device)}>
          Show QR
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => downloadDeviceQrSvg(device)}>
          Download QR SVG
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void downloadDeviceQrPng(device)}>
          Download QR PNG
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            await navigator.clipboard.writeText(device.hardwareIdentifier)
            toast.success('Hardware ID copied.')
          }}
        >
          Copy hardware ID
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
