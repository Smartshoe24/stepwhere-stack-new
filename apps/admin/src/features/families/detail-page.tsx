import { useMemo, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FamilyJoinCodeDto } from '@stepwhere/types'
import { ArrowLeftRight, House, QrCode, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import {
  addAdminFamilyMember,
  createAdminFamilyJoinCode,
  getAdminFamily,
  listAdminUsers,
  revokeAdminFamilyJoinCode,
  transferAdminFamilyAdmin,
} from '@/lib/api-client'
import { formatAdminDateTime } from '@/lib/date-format'
import { handleServerError } from '@/lib/handle-server-error'
import { adminQueryKeys } from '@/features/admin/query-keys'
import { CopyableId } from '@/features/admin/components/copyable-id'
import { StatusBadge } from '@/features/admin/components/status-badge'
import { RecordPageHeader } from '@/features/admin/components/record-page-header'
import { RecordPreviewLink } from '@/features/admin/components/record-preview-link'
import { RelationshipPanel } from '@/features/admin/components/relationship-panel'
import { usePrefetchRelatedRecords } from '@/features/admin/hooks/use-prefetch-related-records'
import { Main } from '@/components/layout/main'
import { EmptyState } from '@/components/patterns/states'
import { Panel } from '@/components/patterns/panel'
import { KeyValue, KeyValueList } from '@/components/patterns/key-value'
import { Stat, StatStrip } from '@/components/patterns/stat-strip'
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
import { createFamilyJoinQrSvg, downloadFamilyJoinQrSvg } from './lib/family-qr'

const route = getRouteApi('/_authenticated/families/$familyId')

export function FamilyDetailPage() {
  const { familyId } = route.useParams()
  const queryClient = useQueryClient()
  const [memberOpen, setMemberOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [joinCodeOpen, setJoinCodeOpen] = useState(false)
  const [previewJoinCode, setPreviewJoinCode] =
    useState<FamilyJoinCodeDto | null>(null)
  const [memberUserId, setMemberUserId] = useState('')
  const [transferUserId, setTransferUserId] = useState('')
  const [joinPhoneNumber, setJoinPhoneNumber] = useState('')
  const [joinExpiresAt, setJoinExpiresAt] = useState('')

  const familyQuery = useQuery({
    queryKey: adminQueryKeys.families.detail(familyId),
    queryFn: () => getAdminFamily(familyId),
  })

  const usersQuery = useQuery({
    queryKey: adminQueryKeys.users.list({
      page: 1,
      pageSize: 100,
      sort: 'displayName',
      dir: 'asc',
    }),
    enabled: memberOpen,
    queryFn: () =>
      listAdminUsers({
        page: 1,
        pageSize: 100,
        sort: 'displayName',
        dir: 'asc',
      }),
  })

  const family = familyQuery.data

  usePrefetchRelatedRecords(
    family
      ? [
          ...(family.admin
            ? [{ type: 'user' as const, id: family.admin.id }]
            : []),
          ...family.members.map((member) => ({
            type: 'user' as const,
            id: member.user.id,
          })),
          ...family.children.flatMap((child) => [
            { type: 'child' as const, id: child.id },
            { type: 'device' as const, id: child.summary.deviceSummary?.id },
          ]),
        ]
      : []
  )

  const eligibleUsers = useMemo(
    () =>
      (usersQuery.data?.items ?? []).filter(
        (user) => !user.family.organization
      ),
    [usersQuery.data?.items]
  )

  const addMemberMutation = useMutation({
    mutationFn: () => addAdminFamilyMember(familyId, { userId: memberUserId }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'families'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
      ])
      setMemberOpen(false)
      setMemberUserId('')
      toast.success('Family member added.')
    },
    onError: handleServerError,
  })

  const transferMutation = useMutation({
    mutationFn: () =>
      transferAdminFamilyAdmin(familyId, { userId: transferUserId }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'families'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
      ])
      setTransferOpen(false)
      setTransferUserId('')
      toast.success('Family admin transferred.')
    },
    onError: handleServerError,
  })

  const createJoinCodeMutation = useMutation({
    mutationFn: () =>
      createAdminFamilyJoinCode(familyId, {
        phoneNumber: joinPhoneNumber,
        expiresAt: joinExpiresAt ? new Date(joinExpiresAt).toISOString() : null,
      }),
    onSuccess: async (updatedFamily) => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'families'] })
      setJoinCodeOpen(false)
      setJoinPhoneNumber('')
      setJoinExpiresAt('')
      const latestCode = updatedFamily.joinCodes[0] ?? null
      setPreviewJoinCode(latestCode)
      toast.success('Join code created.')
    },
    onError: handleServerError,
  })

  const revokeJoinCodeMutation = useMutation({
    mutationFn: (joinCodeId: string) =>
      revokeAdminFamilyJoinCode(familyId, joinCodeId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'families'] })
      toast.success('Join code revoked.')
    },
    onError: handleServerError,
  })

  return (
    <>
      <Main>
        <RecordPageHeader
          backTo='/families'
          title={family?.familyName ?? family?.name ?? 'Family'}
          description='Membership, children and join code operations.'
          icon={<House />}
          onRefresh={() => void familyQuery.refetch()}
          refreshing={familyQuery.isFetching}
          actions={
            family ? (
              <>
                <Button variant='outline' onClick={() => setTransferOpen(true)}>
                  <ArrowLeftRight />
                  Transfer admin
                </Button>
                <Button variant='outline' onClick={() => setJoinCodeOpen(true)}>
                  <QrCode />
                  Create join code
                </Button>
                <Button onClick={() => setMemberOpen(true)}>
                  <UserPlus />
                  Add member
                </Button>
              </>
            ) : null
          }
        />

        {!family ? (
          <Panel>
            <EmptyState
              compact
              title={
                familyQuery.isLoading ? 'Loading family…' : 'Family not found'
              }
            />
          </Panel>
        ) : (
          <>
            <StatStrip>
              <Stat
                label='Admin'
                value={
                  <span className='truncate text-base'>
                    {family.admin?.displayName ?? 'Not assigned'}
                  </span>
                }
              />
              <Stat label='Members' value={family.memberCount} />
              <Stat label='Children' value={family.childCount} />
              <Stat
                label='Active join codes'
                value={family.activeJoinCodeCount}
              />
            </StatStrip>

            <div className='grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.9fr)]'>
              <div className='grid gap-4'>
                <RelationshipPanel title='Family identity'>
                  <KeyValueList columns={2}>
                    <KeyValue
                      label='Family name'
                      value={family.familyName ?? family.name}
                    />
                    <KeyValue label='Slug' value={family.slug} />
                    <KeyValue
                      label='Family ID'
                      value={
                        <CopyableId value={family.id} copyLabel='family ID' />
                      }
                    />
                    <KeyValue
                      label='Admin'
                      value={
                        family.admin ? (
                          <RecordPreviewLink
                            type='user'
                            id={family.admin.id}
                            label={family.admin.displayName}
                          />
                        ) : (
                          'Not assigned'
                        )
                      }
                    />
                  </KeyValueList>
                </RelationshipPanel>

                <RelationshipPanel title='Members'>
                  <div className='divide-y divide-line-faint'>
                    {family.members.map((member) => (
                      <div
                        key={member.id}
                        className='grid gap-2 py-3 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center'
                      >
                        <div className='space-y-1'>
                          <RecordPreviewLink
                            type='user'
                            id={member.user.id}
                            label={member.user.displayName}
                          />
                          <div className='text-sm text-ink-3'>
                            {member.user.phoneNumber} ·{' '}
                            {member.user.email ?? 'No email'}
                          </div>
                        </div>
                        <StatusBadge
                          tone={member.role === 'admin' ? 'info' : 'default'}
                        >
                          {member.role}
                        </StatusBadge>
                      </div>
                    ))}
                  </div>
                </RelationshipPanel>

                <RelationshipPanel title='Children'>
                  <div className='divide-y divide-line-faint'>
                    {family.children.length === 0 ? (
                      <div className='text-sm text-ink-3'>
                        No children in this family.
                      </div>
                    ) : (
                      family.children.map((child) => (
                        <div
                          key={child.id}
                          className='grid gap-2 py-3 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center'
                        >
                          <div className='space-y-1'>
                            <RecordPreviewLink
                              type='child'
                              id={child.id}
                              label={child.name}
                            />
                            <div className='text-sm text-ink-3'>
                              Parent {child.parent?.displayName ?? 'Unassigned'}
                            </div>
                          </div>
                          <div className='text-sm text-ink-3'>
                            {child.summary.deviceSummary?.id ? (
                              <RecordPreviewLink
                                type='device'
                                id={child.summary.deviceSummary.id}
                                label={
                                  child.summary.deviceSummary
                                    .hardwareIdentifier ?? 'Unknown device'
                                }
                              />
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
                <RelationshipPanel title='Join codes'>
                  <div className='divide-y divide-line-faint'>
                    {family.joinCodes.length === 0 ? (
                      <div className='text-sm text-ink-3'>
                        No active join codes.
                      </div>
                    ) : (
                      family.joinCodes.map((joinCode) => (
                        <div
                          key={joinCode.id}
                          className='space-y-2.5 py-3 first:pt-0 last:pb-0'
                        >
                          <div className='font-mono text-xs font-medium text-ink'>
                            {joinCode.phoneNumber}
                          </div>
                          <div className='text-xs text-ink-3'>
                            Expires {formatAdminDateTime(joinCode.expiresAt)}
                          </div>
                          {joinCode.joinUrl ? (
                            <CopyableId
                              value={joinCode.joinUrl}
                              copyLabel='join URL'
                            />
                          ) : null}
                          <div className='flex flex-wrap gap-2'>
                            <Button
                              variant='outline'
                              size='sm'
                              onClick={() => setPreviewJoinCode(joinCode)}
                            >
                              Preview QR
                            </Button>
                            <Button
                              variant='destructive'
                              size='sm'
                              onClick={() =>
                                revokeJoinCodeMutation.mutate(joinCode.id)
                              }
                            >
                              Revoke
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </RelationshipPanel>

                <RelationshipPanel title='Timestamps'>
                  <KeyValueList columns={2}>
                    <KeyValue
                      label='Created'
                      value={formatAdminDateTime(family.createdAt)}
                    />
                    <KeyValue
                      label='Updated'
                      value={formatAdminDateTime(family.updatedAt)}
                    />
                  </KeyValueList>
                </RelationshipPanel>
              </div>
            </div>
          </>
        )}
      </Main>

      <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
        <DialogContent>
          <DialogHeader className='text-start'>
            <DialogTitle>Add existing member</DialogTitle>
            <DialogDescription>
              Add a user who is not already linked to another family.
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-2'>
            <Label>User</Label>
            <Select value={memberUserId} onValueChange={setMemberUserId}>
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='Select a user' />
              </SelectTrigger>
              <SelectContent>
                {eligibleUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.displayName} · {user.phoneNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setMemberOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!memberUserId || addMemberMutation.isPending}
              onClick={() => addMemberMutation.mutate()}
            >
              Add member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader className='text-start'>
            <DialogTitle>Transfer family admin</DialogTitle>
            <DialogDescription>
              Promote one family member to admin and demote the current admin to
              member.
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-2'>
            <Label>New admin</Label>
            <Select value={transferUserId} onValueChange={setTransferUserId}>
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='Select a member' />
              </SelectTrigger>
              <SelectContent>
                {(family?.members ?? [])
                  .filter((member) => member.role !== 'admin')
                  .map((member) => (
                    <SelectItem key={member.userId} value={member.userId}>
                      {member.user.displayName} · {member.user.phoneNumber}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setTransferOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!transferUserId || transferMutation.isPending}
              onClick={() => transferMutation.mutate()}
            >
              Transfer admin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={joinCodeOpen} onOpenChange={setJoinCodeOpen}>
        <DialogContent>
          <DialogHeader className='text-start'>
            <DialogTitle>Create join code</DialogTitle>
            <DialogDescription>
              Generate a join URL and QR code for a family member invite.
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-4'>
            <div className='grid gap-2'>
              <Label>Phone number</Label>
              <Input
                value={joinPhoneNumber}
                onChange={(event) => setJoinPhoneNumber(event.target.value)}
                placeholder='+919876543210'
              />
            </div>
            <div className='grid gap-2'>
              <Label>Expires at</Label>
              <Input
                type='datetime-local'
                value={joinExpiresAt}
                onChange={(event) => setJoinExpiresAt(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setJoinCodeOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !joinPhoneNumber.trim() || createJoinCodeMutation.isPending
              }
              onClick={() => createJoinCodeMutation.mutate()}
            >
              Create join code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!previewJoinCode}
        onOpenChange={(open) => !open && setPreviewJoinCode(null)}
      >
        <DialogContent className='sm:max-w-md'>
          <DialogHeader className='text-start'>
            <DialogTitle>Family join QR</DialogTitle>
          </DialogHeader>
          {previewJoinCode?.joinUrl && family ? (
            <div className='space-y-4'>
              <div
                className='rounded-lg bg-white p-3 shadow-[0_0_0_1px_var(--line)]'
                dangerouslySetInnerHTML={{
                  __html: createFamilyJoinQrSvg({
                    familyName: family.familyName ?? family.name,
                    phoneNumber: previewJoinCode.phoneNumber ?? '',
                    joinUrl: previewJoinCode.joinUrl,
                  }),
                }}
              />
              <CopyableId
                value={previewJoinCode.joinUrl}
                copyLabel='join URL'
              />
            </div>
          ) : (
            <div className='text-sm text-ink-3'>Join QR is unavailable.</div>
          )}
          <DialogFooter>
            <Button variant='outline' onClick={() => setPreviewJoinCode(null)}>
              Close
            </Button>
            {previewJoinCode?.joinUrl && family ? (
              <Button
                onClick={() =>
                  downloadFamilyJoinQrSvg({
                    familyName: family.familyName ?? family.name,
                    phoneNumber: previewJoinCode.phoneNumber ?? '',
                    joinUrl: previewJoinCode.joinUrl!,
                  })
                }
              >
                Download SVG
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
