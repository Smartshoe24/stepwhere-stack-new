export function isAuthDebugEnabled() {
  return (
    import.meta.env.DEV
    || window.localStorage.getItem('stepwhere-admin-auth-debug') === '1'
  )
}

export function logAuthDebug(message: string, data: Record<string, unknown>) {
  if (!isAuthDebugEnabled()) {
    return
  }

  // eslint-disable-next-line no-console
  console.info(`[admin-auth] ${message}`, data)
}
