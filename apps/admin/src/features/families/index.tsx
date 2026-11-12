import { useMemo, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AdminUserListItemDto } from '@stepwhere/types'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import {
  createAdminFamily,
  listAdminFamilies,
  listAdminUsers,
} from '@/lib/api-client'
import { handleServerError } from '@/lib/handle-server-error'
import { adminQueryKeys } from '@/features/admin/query-keys'
import { usePrefetchRelatedRecords } from '@/features/admin/hooks/use-prefetch-related-records'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/patterns/page-header'
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
import { FamiliesTable } from './components/families-table'

const route = getRouteApi('/_authenticated/families/')

export function Families() {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [familyName, setFamilyName] = useState('')
  const [adminUserId, setAdminUserId] = useState('')

  const familiesQuery = useQuery({
    queryKey: adminQueryKeys.families.list(search),
    queryFn: () => listAdminFamilies(search),
  })

  const usersQuery = useQuery({
    queryKey: adminQueryKeys.users.list({
      page: 1,
      pageSize: 100,
      sort: 'displayName',
      dir: 'asc',
    }),
    enabled: createOpen,
    queryFn: () =>
      listAdminUsers({
        page: 1,
        pageSize: 100,
        sort: 'displayName',
        dir: 'asc',
      }),
  })

  const families = useMemo(
    () => familiesQuery.data?.items ?? [],
    [familiesQuery.data?.items]
  )
  usePrefetchRelatedRecords(
    families.flatMap((family) =>
      family.admin ? [{ type: 'user' as const, id: family.admin.id }] : []
    )
  )

  const summary = useMemo(
    () => ({
      total: familiesQuery.data?.total ?? 0,
      members: families.reduce(
        (total, family) => total + family.memberCount,
        0
      ),
      children: families.reduce(
        (total, family) => total + family.childCount,
        0
      ),
      joinCodes: families.reduce(
        (total, family) => total + family.activeJoinCodeCount,
        0
      ),
    }),
    [families, familiesQuery.data?.total]
  )

  const createMutation = useMutation({
    mutationFn: () => createAdminFamily({ familyName, adminUserId }),
    onSuccess: async (family) => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'families'] })
      setCreateOpen(false)
      setFamilyName('')
      setAdminUserId('')
      toast.success('Family created.')
      navigate({ to: '/families/$familyId', params: { familyId: family.id } })
    },
    onError: handleServerError,
  })

  const eligibleUsers = (usersQuery.data?.items ?? []).filter(
    (user: AdminUserListItemDto) => !user.family.organization
  )

  return (
    <>
      <Main>
        <PageHeader
          title='Families'
          description='Family organisations, members, children and join QR codes.'
          onRefresh={() => void familiesQuery.refetch()}
          refreshing={familiesQuery.isFetching}
          actions={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              Create family
            </Button>
          }
        />

        <StatStrip>
          <Stat label='Families' value={summary.total} />
          <Stat label='Members' value={summary.members} />
          <Stat label='Children' value={summary.children} />
          <Stat label='Active join codes' value={summary.joinCodes} />
        </StatStrip>

        <FamiliesTable
          data={families}
          total={familiesQuery.data?.total ?? 0}
          loading={familiesQuery.isLoading}
          onView={(family) =>
            navigate({
              to: '/families/$familyId',
              params: { familyId: family.id },
            })
          }
        />
      </Main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader className='text-start'>
            <DialogTitle>Create family</DialogTitle>
            <DialogDescription>
              Create a family organization and assign its admin.
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-4'>
            <div className='grid gap-2'>
              <Label>Family name</Label>
              <Input
                value={familyName}
                onChange={(event) => setFamilyName(event.target.value)}
                placeholder='Patel family'
              />
            </div>
            <div className='grid gap-2'>
              <Label>Admin user</Label>
              <Select value={adminUserId} onValueChange={setAdminUserId}>
                <SelectTrigger className='w-full'>
                  <SelectValue placeholder='Select a user without a family' />
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
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !familyName.trim() || !adminUserId || createMutation.isPending
              }
              onClick={() => createMutation.mutate()}
            >
              Create family
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
