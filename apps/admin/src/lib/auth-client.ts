import { adminClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

import { stepwhereApiBaseUrl } from './api-client'

const authBaseUrl =
  import.meta.env.VITE_STEPWHERE_AUTH_URL || `${stepwhereApiBaseUrl}/api/auth`

export const authClient = createAuthClient({
  baseURL: authBaseUrl,
  plugins: [adminClient()],
})
