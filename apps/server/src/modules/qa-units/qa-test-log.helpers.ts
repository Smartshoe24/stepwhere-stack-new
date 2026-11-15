/**
 * Test log rules for boards in QA (pure, see qa-test-log.service.ts).
 *
 * A board that is not bound to a child still has its location uploads
 * accepted while its QA unit is before Ready to ship. They go to the unit's
 * test log, never to a child. QA firmware uploads (the "qa" block) also get
 * up to QA_NETWORK_LOOKUP_MAX Wi-Fi/cell lookups, one every 30 s, so a QA run
 * proves the whole path board -> modem -> server -> Google.
 */
import type { LocationTelemetryInput, QaUnitStage, QaUnitStageStatus } from "@stepwhere/types";

import { normalizeChipUid, stageIndex } from "./qa-units.helpers";

/** From this stage on, an unbound board's uploads are refused again (404), as for any customer device. */
export const QA_TEST_LOG_END_STAGE: QaUnitStage = "ready_to_ship";
export const QA_NETWORK_LOOKUP_MAX = 10;
export const QA_NETWORK_LOOKUP_INTERVAL_MS = 30_000;
/** Never-seen boards registered from uploads per hour, across all stations. */
export const QA_AUTO_REGISTER_PER_HOUR = 30;
/** Marks the "registered" event of a unit created from an upload. */
export const QA_AUTO_REGISTER_SOURCE = "telemetry";

/** Thrown out of ingest when the upload went to a test log: the route answers 201. */
export class QaTestReportAccepted extends Error {
  constructor(readonly unitId: string) {
    super("Recorded in the QA test log.");
    this.name = "QaTestReportAccepted";
  }
}

export function acceptsTestReports(unit: { stage: QaUnitStage; stageStatus: QaUnitStageStatus }) {
  return unit.stageStatus !== "scrapped" && stageIndex(unit.stage) < stageIndex(QA_TEST_LOG_END_STAGE);
}

/** The chip UID the upload carries: QA firmware "qa.uid", production firmware 2.2.1+ "fw.uid". */
export function reportChipUid(input: Pick<LocationTelemetryInput, "qa" | "fw">) {
  return normalizeChipUid(input.qa?.uid ?? input.fw?.uid);
}

export function reportFirmware(input: Pick<LocationTelemetryInput, "qa" | "fw">) {
  return input.qa?.fw ?? input.fw?.app ?? null;
}

/** QA firmware starts a new unit at Board tests, production firmware at Production firmware. */
export function autoRegisterStage(input: Pick<LocationTelemetryInput, "qa">): QaUnitStage {
  return input.qa ? "board_tests" : "production_firmware";
}

/** Only IMEIs of our modem model (first 8 digits, the TAC) are registered automatically. */
export function imeiHasAllowedTac(imei: string, tacs: readonly string[]) {
  return tacs.some((tac) => imei.startsWith(tac));
}

export function networkLookupDue(input: {
  isQaFirmware: boolean;
  enabled: boolean;
  usableObservation: boolean;
  lookups: number;
  lastLookupAt: Date | null;
  now: Date;
}) {
  return input.isQaFirmware
    && input.enabled
    && input.usableObservation
    && input.lookups < QA_NETWORK_LOOKUP_MAX
    && (!input.lastLookupAt || input.now.getTime() - input.lastLookupAt.getTime() >= QA_NETWORK_LOOKUP_INTERVAL_MS);
}
