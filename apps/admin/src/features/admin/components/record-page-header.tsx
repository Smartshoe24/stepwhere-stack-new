import type { ReactNode } from 'react'
import { PageHeader } from '@/components/patterns/page-header'

/** Detail-page header: back link, title, meta and actions. */
export function RecordPageHeader({
  backTo,
  title,
  description,
  meta,
  icon,
  actions,
  onRefresh,
  refreshing,
}: {
  backTo: string
  title: ReactNode
  description?: ReactNode
  meta?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  onRefresh?: () => void
  refreshing?: boolean
}) {
  return (
    <PageHeader
      backTo={backTo}
      title={title}
      description={description}
      meta={meta}
      icon={icon}
      actions={actions}
      onRefresh={onRefresh}
      refreshing={refreshing}
    />
  )
}
