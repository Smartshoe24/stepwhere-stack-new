import type { ReactNode } from 'react'
import { Panel } from '@/components/patterns/panel'

/** A titled detail section. Children stack with a 12px rhythm. */
export function RelationshipPanel({
  title,
  description,
  actions,
  children,
  flush,
}: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  flush?: boolean
}) {
  return (
    <Panel
      title={title}
      description={description}
      actions={actions}
      flush={flush}
      bodyClassName={flush ? undefined : 'flex flex-col gap-3'}
    >
      {children}
    </Panel>
  )
}
