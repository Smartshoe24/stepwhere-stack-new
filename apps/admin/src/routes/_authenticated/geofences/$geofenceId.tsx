import { createFileRoute } from '@tanstack/react-router'
import { GeofenceDetailPage } from '@/features/geofences/detail-page'

export const Route = createFileRoute('/_authenticated/geofences/$geofenceId')({
  component: GeofenceDetailPage,
})
