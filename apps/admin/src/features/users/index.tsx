import { useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import type { AdminUserDetailDto, AdminUserListItemDto } from '@stepwhere/types'
import { Download } from 'lucide-react'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/patterns/page-header'
import { Button } from '@/components/ui/button'
import { listAdminUsers } from '@/lib/api-client'
import { adminQueryKeys } from '@/features/admin/query-keys'
import { usePrefetchRelatedRecords } from '@/features/admin/hooks/use-prefetch-related-records'
import { downloadUsersCsv } from './data/admin-user-options'
import { AdminUserDialogs } from './components/admin-user-dialogs'
import { AdminUsersTable } from './components/admin-users-table'

const route = getRouteApi('/_authenticated/users/')

export function Users() {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const [accessUser, setAccessUser] = useState<
    AdminUserListItemDto | AdminUserDetailDto | null
  >(null)
  const [banUser, setBanUser] = useState<
    AdminUserListItemDto | AdminUserDetailDto | null
  >(null)

  const usersQuery = useQuery({
    queryKey: adminQueryKeys.users.list(search),
    queryFn: () => listAdminUsers(search),
  })

  const users = usersQuery.data?.items ?? []
  usePrefetchRelatedRecords(
    users.flatMap((user) => [
      { type: 'family' as const, id: user.family.organization?.id },
      ...user.childRelationship.previewChildren.map((child) => ({
        type: 'child' as const,
        id: child.id,
      })),
      ...user.childRelationship.previewChildren.flatMap((child) =>
        child.activeDevice
          ? [{ type: 'device' as const, id: child.activeDevice.id }]
          : []
      ),
    ])
  )

  return (
    <>
      <Main>
        <PageHeader
          title='Users'
          description='Stepwhere accounts, admin roles and Better Auth bans.'
          onRefresh={() => void usersQuery.refetch()}
          refreshing={usersQuery.isFetching}
          actions={
            <Button
              variant='outline'
              onClick={() => downloadUsersCsv(users)}
              disabled={users.length === 0}
            >
              <Download />
              Export CSV
            </Button>
          }
        />
        <AdminUsersTable
          data={users}
          total={usersQuery.data?.total ?? 0}
          onEdit={setAccessUser}
          onBan={setBanUser}
          onView={(user) =>
            navigate({
              to: '/users/$userId',
              params: { userId: user.id },
            })
          }
          loading={usersQuery.isLoading}
        />
      </Main>

      <AdminUserDialogs
        accessUser={accessUser}
        onAccessUserChange={setAccessUser}
        banUser={banUser}
        onBanUserChange={setBanUser}
        detailUser={null}
        onDetailUserChange={() => {}}
      />
    </>
  )
}
