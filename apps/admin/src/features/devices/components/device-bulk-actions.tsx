import type { AdminDeviceListItemDto } from '@stepwhere/types'
import { Ban, Download, ShieldCheck, Upload } from 'lucide-react'
import { type Table } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DataTableBulkActions } from '@/components/data-table'

type DeviceBulkActionsProps = {
  table: Table<AdminDeviceListItemDto>
  onDownloadSelectedQr: () => void
  onBlockSelected: () => void
  onUnblockSelected: () => void
  onExportSelected: () => void
}

export function DeviceBulkActions({
  table,
  onDownloadSelectedQr,
  onBlockSelected,
  onUnblockSelected,
  onExportSelected,
}: DeviceBulkActionsProps) {
  const selectedRows = table.getFilteredSelectedRowModel().rows

  if (selectedRows.length === 0) {
    return null
  }

  return (
    <DataTableBulkActions table={table} entityName='device'>
      <IconButton
        label='Download selected QR'
        onClick={onDownloadSelectedQr}
        icon={<Download />}
      />
      <IconButton
        label='Block selected'
        onClick={onBlockSelected}
        icon={<Ban />}
      />
      <IconButton
        label='Unblock selected'
        onClick={onUnblockSelected}
        icon={<ShieldCheck />}
      />
      <IconButton
        label='Export selected CSV'
        onClick={onExportSelected}
        icon={<Upload />}
      />
    </DataTableBulkActions>
  )
}

function IconButton({
  label,
  onClick,
  icon,
}: {
  label: string
  onClick: () => void
  icon: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant='outline' size='icon' className='size-8' onClick={onClick}>
          {icon}
          <span className='sr-only'>{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  )
}
