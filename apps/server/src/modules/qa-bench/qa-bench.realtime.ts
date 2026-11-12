import type { QaBenchJobDto, QaSerialLine } from "@stepwhere/types";

import { adminRealtimeRegistry } from "../admin/admin-realtime.service";

export function broadcastStationChanged(stationId: string, reason: string) {
  adminRealtimeRegistry.broadcast({ type: "admin:qa.station.changed", data: { stationId, reason } });
}

export function broadcastJobChanged(job: QaBenchJobDto) {
  adminRealtimeRegistry.broadcast({
    type: "admin:qa.job.changed",
    data: { stationId: job.stationId, job },
  });
}

export function broadcastJobLog(stationId: string, jobId: string, lines: string[]) {
  adminRealtimeRegistry.broadcast({ type: "admin:qa.job.log", data: { stationId, jobId, lines } });
}

export function broadcastSerialData(stationId: string, path: string, lines: QaSerialLine[]) {
  adminRealtimeRegistry.broadcast({ type: "admin:qa.serial.data", data: { stationId, path, lines } });
}

export function broadcastSerialError(stationId: string, path: string, message: string) {
  adminRealtimeRegistry.broadcast({ type: "admin:qa.serial.error", data: { stationId, path, message } });
}
