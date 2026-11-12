import { useCallback, useMemo, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Plus, QrCode, Upload } from 'lucide-react'
import type { AdminDeviceDto, AdminDeviceListItemDto } from '@stepwhere/types'
import { toast } from 'sonner'
import {
  listAdminChildren,
  listAdminDevices,
  unbindAdminDevice,
  updateAdminDevice,
} from '@/lib/api-client'
import { adminQueryKeys } from '@/features/admin/query-keys'
import { usePrefetchRelatedRecords } from '@/features/admin/hooks/use-prefetch-related-records'
import { useLiveNow } from '@/hooks/use-live-now'
import { Main } from '@/components/layout/main'
import { LiveBadge } from '@/components/patterns/live'
import { PageHeader } from '@/components/patterns/page-header'
import { Stat, StatStrip } from '@/components/patterns/stat-strip'
import { Button } from '@/components/ui/button'
import { downloadDevicesCsv } from './data/device-options'
import { DeviceDialogs } from './components/device-dialogs'
import { DevicesTable } from './components/devices-table'
import { downloadDeviceQrZip } from './lib/device-qr'
import { deriveDeviceConnectionState } from './lib/device-connection'

const route = getRouteApi('/_authenticated/devices/')

export function Devices() {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const [createOpen, setCreateOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [editingDevice, setEditingDevice] = useState<AdminDeviceDto | null>(
    null
  )
  const [bindingDevice, setBindingDevice] = useState<AdminDeviceDto | null>(
    null
  )
  const [qrDevice, setQrDevice] = useState<AdminDeviceDto | null>(null)
  const [selectedDevices, setSelectedDevices] = useState<
    AdminDeviceListItemDto[]
  >([])

  const devicesQuery = useQuery({
    queryKey: adminQueryKeys.devices.list(search),
    queryFn: () => listAdminDevices(search),
    refetchInterval: 30_000,
  })
  const childrenQuery = useQuery({
    queryKey: adminQueryKeys.children.list({
      page: 1,
      pageSize: 100,
      sort: 'name',
      dir: 'asc',
    }),
    queryFn: () =>
      listAdminChildren({
        page: 1,
        pageSize: 100,
        sort: 'name',
        dir: 'asc',
      }),
  })

  const devices = useMemo(
    () => devicesQuery.data?.items ?? [],
    [devicesQuery.data?.items]
  )
  const summary = useMemo(() => {
    return {
      total: devices.length,
      bound: devices.filter((device) => !!device.activeBinding).length,
      fresh: devices.filter((device) => device.status === 'fresh').length,
      blocked: devices.filter((device) => device.status === 'blocked').length,
    }
  }, [devices])
  usePrefetchRelatedRecords(
    devices.map((device) => ({
      type: 'child' as const,
      id: device.activeBinding?.childId,
    }))
  )

  const updateStatusMutation = useMutation({
    mutationFn: ({
      device,
      status,
    }: {
      device: AdminDeviceDto
      status: 'fresh' | 'active' | 'inactive' | 'blocked'
    }) => updateAdminDevice(device.id, { status }),
    onSuccess: async () => {
      await devicesQuery.refetch()
    },
  })

  const unbindMutation = useMutation({
    mutationFn: (deviceId: string) => unbindAdminDevice(deviceId),
    onSuccess: async () => {
      await Promise.all([devicesQuery.refetch(), childrenQuery.refetch()])
      toast.success('Device unbound.')
    },
  })
  const mutateDeviceStatus = updateStatusMutation.mutate
  const mutateUnbindDevice = unbindMutation.mutate
  const handleViewDevice = useCallback(
    (device: AdminDeviceListItemDto) =>
      navigate({
        to: '/devices/$deviceId',
        params: { deviceId: device.id },
      }),
    [navigate]
  )
  const handleToggleBlocked = useCallback(
    (device: AdminDeviceListItemDto) =>
      mutateDeviceStatus({
        device,
        status: device.status === 'blocked' ? 'inactive' : 'blocked',
      }),
    [mutateDeviceStatus]
  )
  const handleUnbind = useCallback(
    (device: AdminDeviceListItemDto) => mutateUnbindDevice(device.id),
    [mutateUnbindDevice]
  )

  const updateSelectedDevices = async (nextStatus: 'blocked' | 'inactive') => {
    await Promise.all(
      selectedDevices.map((device) =>
        updateAdminDevice(device.id, { status: nextStatus })
      )
    )
    await devicesQuery.refetch()
    toast.success(
      `${selectedDevices.length} device${
        selectedDevices.length === 1 ? '' : 's'
      } updated.`
    )
  }

  return (
    <>
      <Main>
        <PageHeader
          title='Devices'
          description='Provision, bind, block and export QR labels for Stepwhere shoes.'
          meta={
            devicesQuery.data ? <LiveBadge>Live · 30s refresh</LiveBadge> : null
          }
          onRefresh={() => void devicesQuery.refetch()}
          refreshing={devicesQuery.isFetching}
          actions={
            <>
              <Button
                variant='outline'
                disabled={selectedDevices.length === 0}
                onClick={() => void downloadDeviceQrZip(selectedDevices)}
              >
                <QrCode />
                Selected QR
              </Button>
              <Button variant='outline' onClick={() => setBulkOpen(true)}>
                <Upload />
                Bulk add
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus />
                Add device
              </Button>
            </>
          }
        />

        <StatStrip>
          <Stat label='Devices on page' value={summary.total} />
          <Stat
            label='Bound'
            value={summary.bound}
            meter={summary.total ? summary.bound / summary.total : null}
            tone='ok'
          />
          <Stat label='Fresh / unassigned' value={summary.fresh} />
          <Stat
            label='Blocked'
            value={summary.blocked}
            hint={summary.blocked > 0 ? 'Rejected at ingest' : 'None blocked'}
          />
          <OfflineDevicesOnPage devices={devices} />
        </StatStrip>

        <DevicesTable
          data={devices}
          total={devicesQuery.data?.total ?? 0}
          onEdit={setEditingDevice}
          onBind={setBindingDevice}
          onShowQr={setQrDevice}
          onView={handleViewDevice}
          onSelectionChange={setSelectedDevices}
          onToggleBlocked={handleToggleBlocked}
          onUnbind={handleUnbind}
          onDownloadSelectedQr={() => void downloadDeviceQrZip(selectedDevices)}
          onBlockSelected={() => void updateSelectedDevices('blocked')}
          onUnblockSelected={() => void updateSelectedDevices('inactive')}
          onExportSelected={() => downloadDevicesCsv(selectedDevices)}
          loading={devicesQuery.isLoading}
        />
      </Main>

      <DeviceDialogs
        createOpen={createOpen}
        onCreateOpenChange={setCreateOpen}
        editingDevice={editingDevice}
        onEditingDeviceChange={setEditingDevice}
        bulkOpen={bulkOpen}
        onBulkOpenChange={setBulkOpen}
        bindingDevice={bindingDevice}
        onBindingDeviceChange={setBindingDevice}
        qrDevice={qrDevice}
        onQrDeviceChange={setQrDevice}
        children={childrenQuery.data?.items ?? []}
      />
    </>
  )
}

function OfflineDevicesOnPage({
  devices,
}: {
  devices: AdminDeviceListItemDto[]
}) {
  const now = useLiveNow()
  const offline = devices.filter(
    (device) => deriveDeviceConnectionState(device, now) === 'offline'
  ).length

  return (
    <Stat
      label='Offline on page'
      value={offline}
      meter={devices.length ? offline / devices.length : null}
      tone='caution'
    />
  )
}
