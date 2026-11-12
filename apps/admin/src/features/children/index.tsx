import { useMemo, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AdminChildListItemDto, AdminDeviceDto } from '@stepwhere/types'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import {
  bindAdminDevice,
  listAdminChildren,
  listAdminDevices,
  unbindAdminDevice,
} from '@/lib/api-client'
import { adminQueryKeys } from '@/features/admin/query-keys'
import { usePrefetchRelatedRecords } from '@/features/admin/hooks/use-prefetch-related-records'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/patterns/page-header'
import { Stat, StatStrip } from '@/components/patterns/stat-strip'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { downloadChildrenCsv } from './data/children-options'
import { ChildrenTable } from './components/children-table'

const route = getRouteApi('/_authenticated/children/')

export function Children() {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const queryClient = useQueryClient()
  const [bindingChild, setBindingChild] =
    useState<AdminChildListItemDto | null>(null)
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')

  const childrenQuery = useQuery({
    queryKey: adminQueryKeys.children.list(search),
    queryFn: () => listAdminChildren(search),
  })

  const devicesQuery = useQuery({
    queryKey: adminQueryKeys.devices.list({
      page: 1,
      pageSize: 100,
      binding: 'unbound',
      sort: 'hardwareIdentifier',
      dir: 'asc',
    }),
    queryFn: () =>
      listAdminDevices({
        page: 1,
        pageSize: 100,
        binding: 'unbound',
        sort: 'hardwareIdentifier',
        dir: 'asc',
      }),
  })

  const bindMutation = useMutation({
    mutationFn: async () => {
      if (!bindingChild || !selectedDeviceId) {
        throw new Error('Device selection is required.')
      }

      return bindAdminDevice(selectedDeviceId, { childId: bindingChild.id })
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'children'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'devices'] }),
      ])
      toast.success('Device bound.')
      setBindingChild(null)
      setSelectedDeviceId('')
    },
  })

  const unbindMutation = useMutation({
    mutationFn: (deviceId: string) => unbindAdminDevice(deviceId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'children'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'devices'] }),
      ])
      toast.success('Device unbound.')
    },
  })

  const children = useMemo(
    () => childrenQuery.data?.items ?? [],
    [childrenQuery.data?.items]
  )
  const summary = useMemo(
    () => ({
      total: childrenQuery.data?.total ?? 0,
      bound: children.filter((child) =>
        Boolean(child.summary.deviceSummary?.id)
      ).length,
      alerts: children.filter((child) => child.summary.status === 'alert')
        .length,
      offline: children.filter((child) => child.summary.status === 'offline')
        .length,
    }),
    [children, childrenQuery.data?.total]
  )
  usePrefetchRelatedRecords(
    children.flatMap((child) => [
      { type: 'user' as const, id: child.parent?.id },
      { type: 'device' as const, id: child.summary.deviceSummary?.id },
    ])
  )

  return (
    <>
      <Main>
        <PageHeader
          title='Children'
          description='Child records, active devices and linked parent accounts.'
          onRefresh={() => void childrenQuery.refetch()}
          refreshing={childrenQuery.isFetching}
          actions={
            <Button
              variant='outline'
              onClick={() => downloadChildrenCsv(children)}
              disabled={children.length === 0}
            >
              <Download />
              Export CSV
            </Button>
          }
        />

        <StatStrip>
          <Stat label='Total children' value={summary.total} />
          <Stat
            label='Bound devices'
            value={summary.bound}
            meter={summary.total ? summary.bound / summary.total : null}
            tone='ok'
          />
          <Stat
            label='Alert status'
            value={summary.alerts}
            hint={
              summary.alerts ? (
                <span className='text-breach'>Outside a geofence</span>
              ) : (
                'None on this page'
              )
            }
          />
          <Stat
            label='Offline'
            value={summary.offline}
            meter={summary.total ? summary.offline / summary.total : null}
            tone='caution'
          />
        </StatStrip>

        <ChildrenTable
          data={children}
          total={childrenQuery.data?.total ?? 0}
          loading={childrenQuery.isLoading}
          onView={(child) =>
            navigate({
              to: '/children/$childId',
              params: { childId: child.id },
            })
          }
          onBind={(child) => {
            setBindingChild(child)
            setSelectedDeviceId('')
          }}
          onUnbind={(child) => {
            const deviceId = child.summary.deviceSummary?.id
            if (deviceId) {
              unbindMutation.mutate(deviceId)
            }
          }}
        />
      </Main>

      <Dialog
        open={Boolean(bindingChild)}
        onOpenChange={(open) => !open && setBindingChild(null)}
      >
        <DialogContent>
          <DialogHeader className='text-start'>
            <DialogTitle>
              Bind device{bindingChild ? ` to ${bindingChild.name}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className='grid gap-2'>
            <Select
              value={selectedDeviceId}
              onValueChange={setSelectedDeviceId}
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='Select an unbound device' />
              </SelectTrigger>
              <SelectContent>
                {(devicesQuery.data?.items ?? []).map(
                  (device: AdminDeviceDto) => (
                    <SelectItem key={device.id} value={device.id}>
                      {device.hardwareIdentifier}
                      {device.displayName ? ` · ${device.displayName}` : ''}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setBindingChild(null)}>
              Cancel
            </Button>
            <Button
              disabled={!selectedDeviceId || bindMutation.isPending}
              onClick={() => bindMutation.mutate()}
            >
              Bind device
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
