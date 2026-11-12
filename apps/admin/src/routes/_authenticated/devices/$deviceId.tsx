import { createFileRoute } from '@tanstack/react-router'
import { DeviceDetailPage } from '@/features/devices/detail-page'

export const Route = createFileRoute('/_authenticated/devices/$deviceId')({
  component: DeviceDetailPage,
})
