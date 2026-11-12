import { useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()
let currentNow = Date.now()
let interval: number | undefined
let timeout: number | undefined

function publishNow() {
  currentNow = Date.now()
  listeners.forEach((listener) => listener())
}

function stopClock() {
  if (timeout !== undefined) {
    window.clearTimeout(timeout)
    timeout = undefined
  }

  if (interval !== undefined) {
    window.clearInterval(interval)
    interval = undefined
  }
}

function startClock() {
  stopClock()
  currentNow = Date.now()
  const firstTickDelay = Math.max(1, 1000 - (currentNow % 1000))

  timeout = window.setTimeout(() => {
    timeout = undefined
    publishNow()
    interval = window.setInterval(publishNow, 1000)
  }, firstTickDelay)
}

function subscribe(listener: () => void) {
  listeners.add(listener)

  if (listeners.size === 1) {
    startClock()
  }

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      stopClock()
    }
  }
}

function getSnapshot() {
  return currentNow
}

export function useLiveNow() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
