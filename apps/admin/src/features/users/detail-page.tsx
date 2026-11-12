import { useMemo, useState } from 'react'
import { getRouteApi, Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AdminDeviceDto, AdminUserDetailDto } from '@stepwhere/types'
import { Ban, KeyRound, Plus } from 'lucide-react'
import { toast } from 'sonner'
import {
  createAdminChildForUser,
  getAdminUser,
  listAdminDevices,
} from '@/lib/api-client'
import { formatAdminDate, formatAdminDateTime } from '@/lib/date-format'
import {
  AdminLastSeen,
  LastSeenFreshness,
} from '@/features/admin/components/admin-last-seen'
import { getDisplayNameInitials } from '@/lib/utils'
import { handleServerError } from '@/lib/handle-server-error'
import { adminQueryKeys } from '@/features/admin/query-keys'
import { CopyableId } from '@/features/admin/components/copyable-id'
import { RecordPageHeader } from '@/features/admin/components/record-page-header'
import { RecordPreviewLink } from '@/features/admin/components/record-preview-link'
import { RelationshipPanel } from '@/features/admin/components/relationship-panel'
import { usePrefetchRelatedRecords } from '@/features/admin/hooks/use-prefetch-related-records'
import {
  BanStateBadge,
  ChildTrackingBadge,
  TelemetryStateBadge,
  UserRoleBadge,
  UserStatusBadge,
} from '@/features/admin/components/status-badge'
import { Main } from '@/components/layout/main'
import { EmptyState } from '@/components/patterns/states'
import { Panel } from '@/components/patterns/panel'
import {
  KeyValue,
  KeyValueList,
  LabeledInput,
} from '@/components/patterns/key-value'
import { Stat, StatStrip } from '@/components/patterns/stat-strip'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AdminUserDialogs } from './components/admin-user-dialogs'

const route = getRouteApi('/_authenticated/users/$userId')

export function UserDetailPage() {
  const { userId } = route.useParams()
  const queryClient = useQueryClient()
  const [accessUser, setAccessUser] = useState<AdminUserDetailDto | null>(null)
  const [banUser, setBanUser] = useState<AdminUserDetailDto | null>(null)
  const [addChildOpen, setAddChildOpen] = useState(false)
  const [childForm, setChildForm] = useState({
    name: '',
    schoolName: '',
    gender: '',
    dateOfBirth: '',
    lifecycleStatus: 'active' as 'active' | 'archived',
    avatarUrl: '',
    deviceId: '',
  })

  const query = useQuery({
    queryKey: adminQueryKeys.users.detail(userId),
    queryFn: () => getAdminUser(userId),
  })

  const deviceQuery = useQuery({
    queryKey: adminQueryKeys.devices.list({
      page: 1,
      pageSize: 100,
      binding: 'unbound',
      sort: 'hardwareIdentifier',
      dir: 'asc',
    }),
    enabled: addChildOpen,
    queryFn: () =>
      listAdminDevices({
        page: 1,
        pageSize: 100,
        binding: 'unbound',
        sort: 'hardwareIdentifier',
        dir: 'asc',
      }),
  })

  const createChildMutation = useMutation({
    mutationFn: () =>
      createAdminChildForUser(userId, {
        name: childForm.name,
        schoolName: childForm.schoolName || null,
        gender: childForm.gender || null,
        dateOfBirth: childForm.dateOfBirth || null,
        lifecycleStatus: childForm.lifecycleStatus,
        avatarUrl: childForm.avatarUrl || null,
        deviceId: childForm.deviceId,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'children'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'devices'] }),
      ])
      setAddChildOpen(false)
      setChildForm({
        name: '',
        schoolName: '',
        gender: '',
        dateOfBirth: '',
        lifecycleStatus: 'active',
        avatarUrl: '',
        deviceId: '',
      })
      toast.success('Child created and device linked.')
    },
    onError: handleServerError,
  })

  const user = query.data
  const availableDevices = useMemo(
    () => deviceQuery.data?.items ?? [],
    [deviceQuery.data?.items]
  )
  usePrefetchRelatedRecords([
    ...(user?.family.organization?.id
      ? [{ type: 'family' as const, id: user.family.organization.id }]
      : []),
    ...(user?.children ?? []).flatMap((child) => [
      { type: 'child' as const, id: child.id },
      { type: 'device' as const, id: child.summary.deviceSummary?.id },
    ]),
  ])

  return (
    <>
      <Main>
        <RecordPageHeader
          backTo='/users'
          title={user?.displayName ?? 'User'}
          description='Account, family and child relationships.'
          meta={user ? <UserRoleBadge role={user.role} /> : null}
          onRefresh={() => void query.refetch()}
          refreshing={query.isFetching}
          actions={
            user ? (
              <>
                <Button variant='outline' onClick={() => setAccessUser(user)}>
                  <KeyRound />
                  Edit access
                </Button>
                <Button
                  variant={user.banned ? 'outline' : 'destructive'}
                  onClick={() => setBanUser(user)}
                >
                  <Ban />
                  {user.banned ? 'Unban user' : 'Ban user'}
                </Button>
                <Button onClick={() => setAddChildOpen(true)}>
                  <Plus />
                  Add child
                </Button>
              </>
            ) : null
          }
        />

        {!user ? (
          <Panel>
            <EmptyState
              compact
              title={query.isLoading ? 'Loading user…' : 'User not found'}
            />
          </Panel>
        ) : (
          <>
            <StatStrip>
              <Stat label='Role' value={<UserRoleBadge role={user.role} />} />
              <Stat
                label='Status'
                value={<UserStatusBadge status={user.status} />}
              />
              <Stat
                label='Ban state'
                value={<BanStateBadge banned={user.banned} />}
              />
              <Stat label='Children' value={user.children.length} />
              <Stat
                label='Last seen'
                value={
                  <LastSeenFreshness
                    value={user.lastSeenAt}
                    className='text-base'
                  />
                }
              />
            </StatStrip>

            <div className='grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.95fr)]'>
              <div className='grid gap-4'>
                <RelationshipPanel title='Profile'>
                  <div className='flex items-start gap-4'>
                    <Avatar className='size-14 shadow-[0_0_0_1px_var(--line)]'>
                      <AvatarImage
                        src={user.avatarUrl ?? undefined}
                        alt={user.displayName}
                      />
                      <AvatarFallback className='bg-trail text-sm font-semibold text-on-trail shadow-none'>
                        {getDisplayNameInitials(user.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <KeyValueList columns={2} className='flex-1'>
                      <KeyValue label='Phone' value={user.phoneNumber} />
                      <KeyValue
                        label='Email'
                        value={user.email ?? 'No email'}
                      />
                      <KeyValue
                        label='Address'
                        value={user.currentAddress ?? 'No address'}
                      />
                      <KeyValue
                        label='Date of birth'
                        value={formatAdminDate(user.dateOfBirth)}
                      />
                    </KeyValueList>
                  </div>
                </RelationshipPanel>

                <RelationshipPanel title='Children'>
                  <div className='divide-y divide-line-faint'>
                    {user.children.length === 0 ? (
                      <div className='text-sm text-ink-3'>
                        No children linked to this user.
                      </div>
                    ) : (
                      user.children.map((child) => (
                        <div
                          key={child.id}
                          className='grid gap-3 py-3 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center'
                        >
                          <div className='space-y-2'>
                            <div className='flex flex-wrap items-center gap-2'>
                              <RecordPreviewLink
                                type='child'
                                id={child.id}
                                label={child.name}
                              />
                              <ChildTrackingBadge
                                status={child.summary.status}
                              />
                              <TelemetryStateBadge
                                state={child.summary.telemetryState}
                              />
                            </div>
                            <div className='text-sm text-ink-3'>
                              School {child.schoolName ?? 'Not set'} · Last seen{' '}
                              <AdminLastSeen value={child.summary.lastSeenAt} />
                            </div>
                          </div>
                          <div className='space-y-2 text-sm text-ink-3'>
                            {child.summary.deviceSummary?.id ? (
                              <>
                                <div className='font-medium text-ink'>
                                  Active device
                                </div>
                                <RecordPreviewLink
                                  type='device'
                                  id={child.summary.deviceSummary.id}
                                  label={
                                    child.summary.deviceSummary
                                      .hardwareIdentifier ?? 'Unknown device'
                                  }
                                />
                              </>
                            ) : (
                              'No active device'
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </RelationshipPanel>
              </div>

              <div className='grid gap-4'>
                <RelationshipPanel title='Access'>
                  <KeyValueList>
                    <KeyValue
                      label='Role'
                      value={<UserRoleBadge role={user.role} />}
                    />
                    <KeyValue
                      label='Status'
                      value={<UserStatusBadge status={user.status} />}
                    />
                    <KeyValue
                      label='Banned'
                      value={<BanStateBadge banned={user.banned} />}
                    />
                    <KeyValue
                      label='Ban reason'
                      value={user.banReason ?? 'None'}
                    />
                    <KeyValue
                      label='Ban expiry'
                      value={formatAdminDateTime(user.banExpires)}
                    />
                  </KeyValueList>
                </RelationshipPanel>

                <RelationshipPanel title='Family'>
                  <KeyValueList>
                    <KeyValue
                      label='Organization'
                      value={
                        user.family.organization ? (
                          <RecordPreviewLink
                            type='family'
                            id={user.family.organization.id}
                            label={user.family.organization.name}
                          />
                        ) : (
                          'No family'
                        )
                      }
                    />
                    <KeyValue
                      label='Member role'
                      value={user.family.memberRole ?? 'No role'}
                    />
                    <KeyValue
                      label='Onboarding'
                      value={
                        user.onboardingCompleted ? 'Completed' : 'Incomplete'
                      }
                    />
                  </KeyValueList>
                </RelationshipPanel>

                <RelationshipPanel title='Identifiers and timestamps'>
                  <KeyValueList>
                    <KeyValue
                      label='User ID'
                      value={<CopyableId value={user.id} copyLabel='user ID' />}
                    />
                    <KeyValue
                      label='Created'
                      value={formatAdminDateTime(user.createdAt)}
                    />
                    <KeyValue
                      label='Updated'
                      value={formatAdminDateTime(user.updatedAt)}
                    />
                    <KeyValue
                      label='Last seen'
                      value={<AdminLastSeen value={user.lastSeenAt} />}
                    />
                  </KeyValueList>
                </RelationshipPanel>
              </div>
            </div>
          </>
        )}
      </Main>

      <AdminUserDialogs
        accessUser={accessUser}
        onAccessUserChange={(next) =>
          setAccessUser(next as AdminUserDetailDto | null)
        }
        banUser={banUser}
        onBanUserChange={(next) =>
          setBanUser(next as AdminUserDetailDto | null)
        }
        detailUser={null}
        onDetailUserChange={() => {}}
      />

      <Dialog open={addChildOpen} onOpenChange={setAddChildOpen}>
        <DialogContent className='sm:max-w-xl'>
          <DialogHeader className='text-start'>
            <DialogTitle>Add child</DialogTitle>
            <DialogDescription>
              Create a child under this user and bind an available device
              immediately.
            </DialogDescription>
          </DialogHeader>

          {!user?.family.organization ? (
            <div className='space-y-4 rounded-lg border border-dashed border-line px-4 py-5 text-sm text-ink-3'>
              <p>
                This user must belong to a family before a child can be added.
              </p>
              <p>
                Create or link the family first, then return here to attach the
                child and device in one step.
              </p>
              <div>
                <Button asChild variant='outline' size='sm'>
                  <Link to='/families'>Open families</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className='grid gap-4 sm:grid-cols-2'>
              <LabeledInput
                label='Child name'
                value={childForm.name}
                onChange={(value) =>
                  setChildForm((prev) => ({ ...prev, name: value }))
                }
              />
              <div className='grid gap-2'>
                <Label>Device</Label>
                <Select
                  value={childForm.deviceId}
                  onValueChange={(value) =>
                    setChildForm((prev) => ({ ...prev, deviceId: value }))
                  }
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue placeholder='Select an unbound device' />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDevices.map((device: AdminDeviceDto) => (
                      <SelectItem key={device.id} value={device.id}>
                        {device.hardwareIdentifier}
                        {device.displayName ? ` · ${device.displayName}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <LabeledInput
                label='School'
                value={childForm.schoolName}
                onChange={(value) =>
                  setChildForm((prev) => ({ ...prev, schoolName: value }))
                }
              />
              <LabeledInput
                label='Gender'
                value={childForm.gender}
                onChange={(value) =>
                  setChildForm((prev) => ({ ...prev, gender: value }))
                }
              />
              <LabeledInput
                label='Date of birth'
                type='date'
                value={childForm.dateOfBirth}
                onChange={(value) =>
                  setChildForm((prev) => ({ ...prev, dateOfBirth: value }))
                }
              />
              <div className='grid gap-2'>
                <Label>Lifecycle status</Label>
                <Select
                  value={childForm.lifecycleStatus}
                  onValueChange={(value) =>
                    setChildForm((prev) => ({
                      ...prev,
                      lifecycleStatus: value as 'active' | 'archived',
                    }))
                  }
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='active'>Active</SelectItem>
                    <SelectItem value='archived'>Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className='sm:col-span-2'>
                <LabeledInput
                  label='Avatar URL'
                  value={childForm.avatarUrl}
                  onChange={(value) =>
                    setChildForm((prev) => ({ ...prev, avatarUrl: value }))
                  }
                />
                <p className='mt-2 text-xs text-ink-3'>
                  If no avatar is provided, the child will use initials-only
                  fallback in admin views.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant='outline' onClick={() => setAddChildOpen(false)}>
              Close
            </Button>
            {user?.family.organization ? (
              <Button
                disabled={
                  !childForm.name.trim() ||
                  !childForm.deviceId ||
                  createChildMutation.isPending
                }
                onClick={() => createChildMutation.mutate()}
              >
                Create child
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
