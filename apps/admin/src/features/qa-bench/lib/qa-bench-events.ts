import { useEffect, useRef } from 'react'
import type { AdminRealtimeEvent } from '@stepwhere/types'

/**
 * Streaming bench events (job logs, serial lines) arrive on the shared admin
 * realtime socket. They are too frequent for query invalidation, so the
 * realtime hook forwards them here and the Bench screen subscribes directly.
 */
export type QaBenchStreamEvent = Extract<
  AdminRealtimeEvent,
  {
    type:
      | 'admin:qa.job.changed'
      | 'admin:qa.job.log'
      | 'admin:qa.serial.data'
      | 'admin:qa.serial.error'
  }
>

type Listener = (event: QaBenchStreamEvent) => void

const listeners = new Set<Listener>()

export function emitQaBenchEvent(event: QaBenchStreamEvent) {
  for (const listener of listeners) {
    listener(event)
  }
}

export function useQaBenchEvents(listener: Listener) {
  const latest = useRef(listener)

  useEffect(() => {
    latest.current = listener
  })

  useEffect(() => {
    const forward: Listener = (event) => latest.current(event)
    listeners.add(forward)
    return () => {
      listeners.delete(forward)
    }
  }, [])
}
