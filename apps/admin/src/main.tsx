import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  ApiError,
  ApiNetworkError,
  ApiTimeoutError,
  setApiUnauthorizedHandler,
} from '@/lib/api-client'
import { clearSessionQuery } from '@/features/auth/session'
import { RoutePending } from '@/features/errors/route-pending'
import { handleServerError } from '@/lib/handle-server-error'
import { TooltipProvider } from '@/components/ui/tooltip'
import { routeTree } from './routeTree.gen'
import './styles/index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // eslint-disable-next-line no-console
        if (import.meta.env.DEV) console.log({ failureCount, error })

        if (failureCount >= 0 && import.meta.env.DEV) return false
        if (failureCount > 3 && import.meta.env.PROD) return false

        if (
          error instanceof ApiNetworkError ||
          error instanceof ApiTimeoutError
        ) {
          return false
        }

        return !(error instanceof ApiError && [401, 403].includes(error.status))
      },
      refetchOnWindowFocus: import.meta.env.PROD,
      staleTime: 10 * 1000,
    },
    mutations: {
      onError: (error) => {
        handleServerError(error)

        if (error instanceof ApiError && error.status === 304) {
          toast.error('Content not modified!')
        }
      },
    },
  },
  queryCache: new QueryCache({
    onError: (error) => {
      if (
        error instanceof ApiNetworkError ||
        error instanceof ApiTimeoutError
      ) {
        handleServerError(error)
        return
      }

      if (!(error instanceof ApiError)) {
        return
      }

      if (error.status === 403) {
        router.navigate({ to: '/403' })
      }

      if (error.status === 500) {
        toast.error('Internal Server Error!')

        if (import.meta.env.PROD) {
          router.navigate({ to: '/500' })
        }
      }
    },
  }),
})

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  defaultPendingComponent: RoutePending,
  defaultPendingMs: 200,
  defaultPendingMinMs: 300,
})

setApiUnauthorizedHandler(() => {
  const redirect = `${router.history.location.href}`
  clearSessionQuery(queryClient)
  router.navigate({ to: '/sign-in', search: { redirect } })
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>
    </StrictMode>
  )
}
