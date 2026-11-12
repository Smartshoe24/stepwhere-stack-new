import type { QaTestRunDto } from "@stepwhere/types";

import { adminRealtimeRegistry } from "../admin/admin-realtime.service";

export function broadcastUnitChanged(unitId: string, stationId: string | null) {
  adminRealtimeRegistry.broadcast({ type: "admin:qa.unit.changed", data: { unitId, stationId } });
}

export function broadcastTestRunChanged(run: QaTestRunDto) {
  adminRealtimeRegistry.broadcast({ type: "admin:qa.test-run.changed", data: { stationId: run.stationId, run } });
}
