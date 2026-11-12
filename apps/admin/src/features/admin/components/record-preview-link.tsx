import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  AdminChildDetailDto,
  AdminDeviceDetailDto,
  AdminFamilyDetailDto,
  AdminGeofenceDetailDto,
  AdminRelatedRecordType,
  AdminUserDetailDto,
} from '@stepwhere/types'
import { CopyableId } from '@/features/admin/components/copyable-id'
import { AdminLastSeen } from '@/features/admin/components/admin-last-seen'
import { formatAdminDateTime } from '@/lib/date-format'
import {
  BanStateBadge,
  ChildLifecycleBadge,
  ChildTrackingBadge,
  DevicePlatformBadge,
  DeviceStatusBadge,
  ContainmentBadge,
  GeofenceStatusBadge,
  TelemetryStateBadge,
  UserRoleBadge,
  UserStatusBadge,
} from '@/features/admin/components/status-badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getChildRecordQueryOptions,
  getDeviceRecordQueryOptions,
  getFamilyRecordQueryOptions,
  getGeofenceRecordQueryOptions,
  getUserRecordQueryOptions,
  prefetchRelatedRecord,
} from '../lib/related-records'

type RecordPreviewLinkProps = {
  type: AdminRelatedRecordType
  id: string | null | undefined
  label: string
  disabledLabel?: string
  prefetch?: boolean
  openOnHover?: boolean
}

type PreviewLinkShellProps = {
  type: AdminRelatedRecordType
  id: string | null | undefined
  label: string
  disabledLabel?: string
  prefetch?: boolean
  openOnHover?: boolean
  onPrime: () => void
  content: ReactNode
}

function LoadingState() {
  return (
    <div className='space-y-3'>
      <Skeleton className='h-5 w-40' />
      <Skeleton className='h-4 w-full' />
      <Skeleton className='h-4 w-2/3' />
    </div>
  )
}

function MissingState({ id }: { id: string }) {
  return (
    <div className='space-y-3'>
      <div className='text-sm font-medium text-ink'>Record not found</div>
      <div className='text-sm text-ink-3'>
        No related record was returned for {id}.
      </div>
    </div>
  )
}

function ErrorState() {
  return (
    <div className='space-y-3'>
      <div className='text-sm font-medium text-ink'>Unable to load record</div>
      <div className='text-sm text-ink-3'>
        Refresh the page or open the full record directly.
      </div>
    </div>
  )
}

function getRecordLinkProps(type: AdminRelatedRecordType, id: string) {
  if (type === 'user') {
    return {
      to: '/users/$userId' as const,
      params: { userId: id },
    }
  }

  if (type === 'child') {
    return {
      to: '/children/$childId' as const,
      params: { childId: id },
    }
  }

  if (type === 'family') {
    return {
      to: '/families/$familyId' as const,
      params: { familyId: id },
    }
  }

  if (type === 'geofence') {
    return {
      to: '/geofences/$geofenceId' as const,
      params: { geofenceId: id },
    }
  }

  return {
    to: '/devices/$deviceId' as const,
    params: { deviceId: id },
  }
}

function PreviewLinkShell({
  type,
  id,
  label,
  disabledLabel,
  prefetch = true,
  openOnHover = true,
  onPrime,
  content,
}: PreviewLinkShellProps) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current)
      }
    }
  }, [])

  const clearCloseTimer = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  const scheduleClose = () => {
    clearCloseTimer()
    closeTimer.current = window.setTimeout(() => setOpen(false), 120)
  }

  if (!id) {
    return <span className='text-sm text-ink-3'>{disabledLabel ?? label}</span>
  }

  const prime = () => {
    if (prefetch) {
      onPrime()
    }
  }

  const linkProps = getRecordLinkProps(type, id)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Link
          {...linkProps}
          onPointerEnter={() => {
            clearCloseTimer()
            prime()
            if (openOnHover) {
              setOpen(true)
            }
          }}
          onPointerLeave={scheduleClose}
          onFocus={() => {
            clearCloseTimer()
            prime()
            setOpen(true)
          }}
          className='focus-trail cursor-pointer rounded-xs text-left font-medium text-ink decoration-act/60 underline-offset-[3px] transition-colors hover:text-act hover:underline group-data-[state=selected]/row:text-here'
        >
          {label}
        </Link>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className='w-80'
        onPointerEnter={clearCloseTimer}
        onPointerLeave={scheduleClose}
      >
        {content}
      </PopoverContent>
    </Popover>
  )
}

export function RecordPreviewLink(props: RecordPreviewLinkProps) {
  if (props.type === 'user') {
    return <UserPreviewLink {...props} />
  }

  if (props.type === 'child') {
    return <ChildPreviewLink {...props} />
  }

  if (props.type === 'family') {
    return <FamilyPreviewLink {...props} />
  }

  if (props.type === 'geofence') {
    return <GeofencePreviewLink {...props} />
  }

  return <DevicePreviewLink {...props} />
}

function UserPreviewLink(props: Omit<RecordPreviewLinkProps, 'type'>) {
  const queryClient = useQueryClient()
  const id = props.id ?? undefined
  const [queryEnabled, setQueryEnabled] = useState(false)
  const query = useQuery({
    ...getUserRecordQueryOptions(id ?? ''),
    enabled: Boolean(id) && queryEnabled,
  })

  return (
    <PreviewLinkShell
      {...props}
      type='user'
      id={id}
      onPrime={() => {
        setQueryEnabled(true)
        void prefetchRelatedRecord(queryClient, {
          type: 'user',
          id,
        })
      }}
      content={
        !id ? null : query.isLoading ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState />
        ) : !query.data ? (
          <MissingState id={id} />
        ) : (
          <UserPreviewContent data={query.data} />
        )
      }
    />
  )
}

function ChildPreviewLink(props: Omit<RecordPreviewLinkProps, 'type'>) {
  const queryClient = useQueryClient()
  const id = props.id ?? undefined
  const [queryEnabled, setQueryEnabled] = useState(false)
  const query = useQuery({
    ...getChildRecordQueryOptions(id ?? ''),
    enabled: Boolean(id) && queryEnabled,
  })

  return (
    <PreviewLinkShell
      {...props}
      type='child'
      id={id}
      onPrime={() => {
        setQueryEnabled(true)
        void prefetchRelatedRecord(queryClient, {
          type: 'child',
          id,
        })
      }}
      content={
        !id ? null : query.isLoading ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState />
        ) : !query.data ? (
          <MissingState id={id} />
        ) : (
          <ChildPreviewContent data={query.data} />
        )
      }
    />
  )
}

function DevicePreviewLink(props: Omit<RecordPreviewLinkProps, 'type'>) {
  const queryClient = useQueryClient()
  const id = props.id ?? undefined
  const [queryEnabled, setQueryEnabled] = useState(false)
  const query = useQuery({
    ...getDeviceRecordQueryOptions(id ?? ''),
    enabled: Boolean(id) && queryEnabled,
  })

  return (
    <PreviewLinkShell
      {...props}
      type='device'
      id={id}
      onPrime={() => {
        setQueryEnabled(true)
        void prefetchRelatedRecord(queryClient, {
          type: 'device',
          id,
        })
      }}
      content={
        !id ? null : query.isLoading ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState />
        ) : !query.data ? (
          <MissingState id={id} />
        ) : (
          <DevicePreviewContent data={query.data} />
        )
      }
    />
  )
}

function FamilyPreviewLink(props: Omit<RecordPreviewLinkProps, 'type'>) {
  const queryClient = useQueryClient()
  const id = props.id ?? undefined
  const [queryEnabled, setQueryEnabled] = useState(false)
  const query = useQuery({
    ...getFamilyRecordQueryOptions(id ?? ''),
    enabled: Boolean(id) && queryEnabled,
  })

  return (
    <PreviewLinkShell
      {...props}
      type='family'
      id={id}
      onPrime={() => {
        setQueryEnabled(true)
        void prefetchRelatedRecord(queryClient, {
          type: 'family',
          id,
        })
      }}
      content={
        !id ? null : query.isLoading ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState />
        ) : !query.data ? (
          <MissingState id={id} />
        ) : (
          <FamilyPreviewContent data={query.data} />
        )
      }
    />
  )
}

function GeofencePreviewLink(props: Omit<RecordPreviewLinkProps, 'type'>) {
  const queryClient = useQueryClient()
  const id = props.id ?? undefined
  const [queryEnabled, setQueryEnabled] = useState(false)
  const query = useQuery({
    ...getGeofenceRecordQueryOptions(id ?? ''),
    enabled: Boolean(id) && queryEnabled,
  })

  return (
    <PreviewLinkShell
      {...props}
      type='geofence'
      id={id}
      onPrime={() => {
        setQueryEnabled(true)
        void prefetchRelatedRecord(queryClient, {
          type: 'geofence',
          id,
        })
      }}
      content={
        !id ? null : query.isLoading ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState />
        ) : !query.data ? (
          <MissingState id={id} />
        ) : (
          <GeofencePreviewContent data={query.data} />
        )
      }
    />
  )
}

function UserPreviewContent({ data }: { data: AdminUserDetailDto }) {
  return (
    <div className='space-y-4 text-sm'>
      <div className='space-y-2'>
        <div className='font-medium text-ink'>{data.displayName}</div>
        <div className='text-ink-3'>{data.phoneNumber}</div>
        <div className='text-ink-3'>{data.email ?? 'No email'}</div>
        <div className='flex flex-wrap gap-2'>
          <UserRoleBadge role={data.role} />
          <UserStatusBadge status={data.status} />
          <BanStateBadge banned={data.banned} />
        </div>
        <div className='text-ink-3'>
          {data.children.length} child{data.children.length === 1 ? '' : 'ren'}
        </div>
        <div className='text-xs text-ink-3'>
          Last seen <AdminLastSeen value={data.lastSeenAt} />
        </div>
      </div>
    </div>
  )
}

function ChildPreviewContent({ data }: { data: AdminChildDetailDto }) {
  return (
    <div className='space-y-4 text-sm'>
      <div className='space-y-2'>
        <div className='font-medium text-ink'>{data.name}</div>
        <div className='flex flex-wrap gap-2'>
          <ChildLifecycleBadge status={data.lifecycleStatus} />
          <ChildTrackingBadge status={data.summary.status} />
          <TelemetryStateBadge state={data.summary.telemetryState} />
        </div>
        <div className='text-ink-3'>
          {data.parent?.displayName ?? 'No parent user'}
        </div>
        {data.summary.deviceSummary?.hardwareIdentifier ? (
          <CopyableId
            value={data.summary.deviceSummary.hardwareIdentifier}
            copyLabel='hardware ID'
          />
        ) : (
          <div className='text-ink-3'>No active device</div>
        )}
        <div className='text-xs text-ink-3'>
          Last seen <AdminLastSeen value={data.summary.lastSeenAt} />
        </div>
      </div>
    </div>
  )
}

function DevicePreviewContent({ data }: { data: AdminDeviceDetailDto }) {
  return (
    <div className='space-y-4 text-sm'>
      <div className='space-y-2'>
        <CopyableId value={data.hardwareIdentifier} copyLabel='hardware ID' />
        <div className='text-ink-3'>{data.displayName ?? 'No label'}</div>
        <div className='flex flex-wrap gap-2'>
          <DevicePlatformBadge platform={data.platform} />
          <DeviceStatusBadge status={data.status} />
        </div>
        <div className='text-ink-3'>
          {data.activeBinding?.childName ?? 'Unbound'}
        </div>
        <div className='text-ink-3'>
          {data.reservation.reservedUntil
            ? `Reserved until ${formatAdminDateTime(data.reservation.reservedUntil)}`
            : 'Not reserved'}
        </div>
        <div className='text-xs text-ink-3'>
          Last seen <AdminLastSeen value={data.lastSeenAt} />
        </div>
      </div>
    </div>
  )
}

function FamilyPreviewContent({ data }: { data: AdminFamilyDetailDto }) {
  return (
    <div className='space-y-4 text-sm'>
      <div className='space-y-2'>
        <div className='font-medium text-ink'>
          {data.familyName ?? data.name}
        </div>
        <div className='text-ink-3'>{data.slug}</div>
        <div className='text-ink-3'>
          Admin {data.admin?.displayName ?? 'Not assigned'}
        </div>
        <div className='flex flex-wrap gap-3 text-xs text-ink-3'>
          <span>{data.memberCount} members</span>
          <span>{data.childCount} children</span>
          <span>{data.activeJoinCodeCount} active join codes</span>
        </div>
        <div className='text-xs text-ink-3'>
          Created {formatAdminDateTime(data.createdAt)}
        </div>
      </div>
    </div>
  )
}

function GeofencePreviewContent({ data }: { data: AdminGeofenceDetailDto }) {
  return (
    <div className='space-y-4 text-sm'>
      <div className='space-y-2'>
        <div className='font-medium text-ink'>{data.childName}</div>
        <div className='flex flex-wrap gap-2'>
          <GeofenceStatusBadge status={data.status} />
          <ContainmentBadge state={data.containmentState} />
        </div>
        <div className='text-ink-3'>
          Family {data.family.familyName ?? data.family.name}
        </div>
        <div className='text-ink-3'>
          Device {data.activeDevice?.hardwareIdentifier ?? 'No active device'}
        </div>
        <div className='text-ink-3'>
          Radius {data.radiusMeters ? `${data.radiusMeters}m` : 'Not set'}
        </div>
        <div className='text-xs text-ink-3'>
          Evaluated {formatAdminDateTime(data.lastEvaluatedAt)}
        </div>
      </div>
    </div>
  )
}
