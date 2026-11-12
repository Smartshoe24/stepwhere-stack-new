import { useEffect } from 'react'
import { Outlet } from '@tanstack/react-router'

/** Every QA page uses the calmer status colours (see `.qa-calm` in styles/theme.css). */
export function QaLayout() {
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('qa-calm')
    return () => root.classList.remove('qa-calm')
  }, [])

  return <Outlet />
}
