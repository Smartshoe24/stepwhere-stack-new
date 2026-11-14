import type { AdminRealtimeEvent } from '@stepwhere/types'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { stepwhereApiBaseUrl } from '@/lib/api-client'
import { useSessionQuery } from '@/features/auth/session'
import { emitQaBenchEvent } from '@/features/qa-bench/lib/qa-bench-events'
import { upsertQaJobInCache, upsertQaTestRunInCache } from '@/features/qa-bench/lib/qa-bench-cache'
import { showQaAttention } from '@/features/qa-bench/lib/qa-attention'

const MAX_RECONNECT_DELAY_MS = 30_000
const HEARTBEAT_STALE_AFTER_MS = 45_000
const HEARTBEAT_WATCH_INTERVAL_MS = 10_000
const TELEMETRY_FLUSH_DELAY_MS = 250

function toWebSocketUrl(baseUrl: string) {
  if (baseUrl.startsWith('https://')) {
    return baseUrl.replace('https://', 'wss://')
  }

  if (baseUrl.startsWith('http://')) {
    return baseUrl.replace('http://', 'ws://')
  }

  return baseUrl
}

function getReconnectDelay(attempt: number) {
  const baseDelay = Math.min(1_000 * (2 ** attempt), MAX_RECONNECT_DELAY_MS)
  return Math.round(baseDelay * (0.8 + Math.random() * 0.4))
}

export function useAdminRealtime() {
  const queryClient = useQueryClient()
  const sessionQuery = useSessionQuery()
  const user = sessionQuery.data?.user

  useEffect(() => {
    if (user?.role !== 'admin') {
      return
    }

    let disposed = false
    let generation = 0
    let ws: WebSocket | null = null
    let socketOpen = false
    let reconnectAttempt = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let telemetryFlushTimer: ReturnType<typeof setTimeout> | null = null
    let telemetryFlushInFlight = false
    let trailingTelemetryFlushRequired = false
    let heartbeatSupported = false
    let lastTrafficAt = Date.now()
    let isOnline = navigator.onLine
    const pendingDeviceIds = new Set<string>()
    const pendingChildIds = new Set<string>()

    function clearReconnectTimer() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    }

    function closeCurrentSocket() {
      socketOpen = false
      ws?.close()
      ws = null
    }

    function reconcileActiveRealtimeQueries() {
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'devices'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'children'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'telemetry'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'qa'] }),
      ])
    }

    function scheduleTelemetryFlush() {
      if (disposed || telemetryFlushTimer) {
        return
      }

      telemetryFlushTimer = setTimeout(() => {
        telemetryFlushTimer = null
        void flushTelemetryInvalidations()
      }, TELEMETRY_FLUSH_DELAY_MS)
    }

    async function flushTelemetryInvalidations() {
      if (telemetryFlushInFlight) {
        trailingTelemetryFlushRequired = true
        return
      }

      if (pendingDeviceIds.size === 0 && pendingChildIds.size === 0) {
        return
      }

      const deviceIds = [...pendingDeviceIds]
      const childIds = [...pendingChildIds]
      pendingDeviceIds.clear()
      pendingChildIds.clear()
      telemetryFlushInFlight = true

      try {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['admin', 'devices'] }),
          queryClient.invalidateQueries({ queryKey: ['admin', 'children'] }),
          queryClient.invalidateQueries({ queryKey: ['admin', 'telemetry', 'devices'] }),
          ...deviceIds.map((deviceId) => queryClient.invalidateQueries({
            queryKey: ['admin', 'devices', 'detail', deviceId],
          })),
          ...childIds.flatMap((childId) => [
            queryClient.invalidateQueries({
              queryKey: ['admin', 'children', 'detail', childId],
            }),
            queryClient.invalidateQueries({
              queryKey: ['admin', 'telemetry', 'children', childId],
            }),
          ]),
        ])
      } finally {
        telemetryFlushInFlight = false

        if (
          trailingTelemetryFlushRequired
          || pendingDeviceIds.size > 0
          || pendingChildIds.size > 0
        ) {
          trailingTelemetryFlushRequired = false
          scheduleTelemetryFlush()
        }
      }
    }

    function queueTelemetryInvalidation(event: Extract<
      AdminRealtimeEvent,
      { type: 'admin:device.telemetry.changed' }
    >) {
      pendingDeviceIds.add(event.data.deviceId)
      if (event.data.childId) {
        pendingChildIds.add(event.data.childId)
      }

      if (telemetryFlushInFlight) {
        trailingTelemetryFlushRequired = true
      }
      scheduleTelemetryFlush()
    }

    function handleMessage(event: AdminRealtimeEvent) {
      switch (event.type) {
        case 'realtime.heartbeat':
          heartbeatSupported = true
          break
        case 'admin:child.updated':
          void queryClient.invalidateQueries({ queryKey: ['admin', 'children'] })
          void queryClient.invalidateQueries({
            queryKey: ['admin', 'children', 'detail', event.data.childId],
          })
          if (event.data.deviceId) {
            void queryClient.invalidateQueries({ queryKey: ['admin', 'devices'] })
            void queryClient.invalidateQueries({
              queryKey: ['admin', 'devices', 'detail', event.data.deviceId],
            })
          }
          break
        case 'admin:device.telemetry.changed':
          queueTelemetryInvalidation(event)
          break
        case 'admin:geofence.changed':
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: ['admin', 'geofences'] }),
            queryClient.invalidateQueries({ queryKey: ['admin', 'geofence-breaches'] }),
            queryClient.invalidateQueries({
              queryKey: ['admin', 'geofences', 'breach-counts'],
            }),
          ])
          if (event.data.geofenceId) {
            void queryClient.invalidateQueries({
              queryKey: ['admin', 'geofences', 'detail', event.data.geofenceId],
            })
          }
          break
        case 'admin:geofence.breach.created':
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: ['admin', 'geofences'] }),
            queryClient.invalidateQueries({ queryKey: ['admin', 'geofence-breaches'] }),
            queryClient.invalidateQueries({
              queryKey: ['admin', 'geofences', 'breach-counts'],
            }),
          ])
          toast.error('New geofence breach detected.')
          break
        case 'admin:geofence.breach.acknowledged':
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: ['admin', 'geofences'] }),
            queryClient.invalidateQueries({ queryKey: ['admin', 'geofence-breaches'] }),
            queryClient.invalidateQueries({
              queryKey: ['admin', 'geofences', 'breach-counts'],
            }),
          ])
          break
        case 'admin:qa.station.changed':
          void queryClient.invalidateQueries({ queryKey: ['admin', 'qa', 'stations'] })
          void queryClient.invalidateQueries({
            queryKey: ['admin', 'qa', 'station-slots', event.data.stationId],
          })
          if (event.data.reason === 'jobs') {
            // Automation removed one of its own "is a board there?" checks.
            void queryClient.invalidateQueries({ queryKey: ['admin', 'qa', 'jobs', event.data.stationId] })
          }
          break
        case 'admin:qa.attention':
          showQaAttention(event.data)
          break
        case 'admin:qa.job.changed':
          upsertQaJobInCache(queryClient, event.data.job)
          if (event.data.job.status !== 'queued' && event.data.job.status !== 'running') {
            void queryClient.invalidateQueries({ queryKey: ['admin', 'qa', 'stations'] })
            void queryClient.invalidateQueries({
              queryKey: ['admin', 'qa', 'station-slots', event.data.stationId],
            })
          }
          emitQaBenchEvent(event)
          break
        case 'admin:qa.test-run.changed':
          upsertQaTestRunInCache(queryClient, event.data.run)
          break
        case 'admin:qa.unit.changed':
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: ['admin', 'qa', 'units'] }),
            queryClient.invalidateQueries({ queryKey: ['admin', 'qa', 'overview'] }),
            queryClient.invalidateQueries({ queryKey: ['admin', 'qa', 'station-unit'] }),
            queryClient.invalidateQueries({ queryKey: ['admin', 'qa', 'station-test-run'] }),
            queryClient.invalidateQueries({ queryKey: ['admin', 'qa', 'station-slots'] }),
          ])
          break
        case 'admin:qa.job.log':
        case 'admin:qa.serial.data':
        case 'admin:qa.serial.error':
          emitQaBenchEvent(event)
          break
        case 'admin:family.changed':
          void queryClient.invalidateQueries({ queryKey: ['admin', 'families'] })
          if (event.data.familyId) {
            void queryClient.invalidateQueries({
              queryKey: ['admin', 'families', 'detail', event.data.familyId],
            })
          }
          break
      }
    }

    function scheduleReconnect() {
      if (disposed || !isOnline || document.visibilityState === 'hidden' || reconnectTimer) {
        return
      }

      const delay = getReconnectDelay(reconnectAttempt)
      reconnectAttempt += 1
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        connect()
      }, delay)
    }

    function connect() {
      if (disposed || !isOnline || document.visibilityState === 'hidden') {
        return
      }

      clearReconnectTimer()
      closeCurrentSocket()
      const currentGeneration = ++generation
      const socket = new WebSocket(
        `${toWebSocketUrl(stepwhereApiBaseUrl)}/v1/admin/realtime/ws`,
      )
      ws = socket

      socket.onopen = () => {
        if (disposed || currentGeneration !== generation) {
          return
        }

        socketOpen = true
        reconnectAttempt = 0
        lastTrafficAt = Date.now()
        void reconcileActiveRealtimeQueries()
      }

      socket.onmessage = (message) => {
        if (disposed || currentGeneration !== generation) {
          return
        }

        lastTrafficAt = Date.now()
        try {
          handleMessage(JSON.parse(String(message.data)) as AdminRealtimeEvent)
        } catch {
          // Ignore malformed or forward-incompatible payloads without killing recovery.
        }
      }

      socket.onclose = () => {
        if (disposed || currentGeneration !== generation) {
          return
        }

        socketOpen = false
        ws = null
        scheduleReconnect()
      }

      socket.onerror = () => {
        if (disposed || currentGeneration !== generation) {
          return
        }

        closeCurrentSocket()
        scheduleReconnect()
      }
    }

    function reconnectNow() {
      if (disposed || !isOnline || document.visibilityState === 'hidden') {
        return
      }

      generation += 1
      reconnectAttempt = 0
      clearReconnectTimer()
      closeCurrentSocket()
      connect()
    }

    function handleOnline() {
      const wasOnline = isOnline
      isOnline = true
      if (!wasOnline) {
        reconnectNow()
      }
    }

    function handleOffline() {
      isOnline = false
      generation += 1
      clearReconnectTimer()
      closeCurrentSocket()
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        generation += 1
        clearReconnectTimer()
        closeCurrentSocket()
      } else {
        reconnectNow()
      }
    }

    const heartbeatWatch = setInterval(() => {
      if (
        heartbeatSupported
        && socketOpen
        && Date.now() - lastTrafficAt > HEARTBEAT_STALE_AFTER_MS
      ) {
        reconnectNow()
      }
    }, HEARTBEAT_WATCH_INTERVAL_MS)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    connect()

    return () => {
      disposed = true
      generation += 1
      clearReconnectTimer()
      if (telemetryFlushTimer) {
        clearTimeout(telemetryFlushTimer)
      }
      clearInterval(heartbeatWatch)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      closeCurrentSocket()
      pendingDeviceIds.clear()
      pendingChildIds.clear()
    }
  }, [queryClient, user?.role])
}
