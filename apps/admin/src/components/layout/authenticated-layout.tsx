import { Outlet } from '@tanstack/react-router'
import { getCookie } from '@/lib/cookies'
import { SearchProvider } from '@/context/search-provider'
import { useAdminRealtime } from '@/features/admin/realtime/use-admin-realtime'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { Header } from '@/components/layout/header'
import { SkipToMain } from '@/components/skip-to-main'

type AuthenticatedLayoutProps = {
  children?: React.ReactNode
}

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const defaultOpen = getCookie('sidebar_state') !== 'false'
  useAdminRealtime()

  return (
    <SearchProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <SkipToMain />
        <AppSidebar />
        <SidebarInset className='@container/content min-w-0 bg-canvas'>
          <Header />
          {children ?? <Outlet />}
        </SidebarInset>
      </SidebarProvider>
    </SearchProvider>
  )
}
