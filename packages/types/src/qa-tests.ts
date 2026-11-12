// Board tests run by the QA firmware (apps/firmware/stepwhere.qa.ino) and
// reported over the debug UART. The Bench agent forwards TTL lines as usual;
// the server picks out lines that start with QA_TTL_PREFIX and records them as
// a test run on the unit whose chip UID the firmware reports.
//
// One message per line: `@QA {"v":1,"e":"test","run":3,"uid":"…","id":"gsm","status":"pass","ms":8120,"data":{…}}`
// The firmware decides pass or fail and includes the limit it used, so a
// result never depends on server-side thresholds.

export const QA_TTL_PREFIX = "@QA ";
export const QA_TTL_PROTOCOL_VERSION = 1;
/** Typed into the console to start a test that waits for the operator (the step counter). */
export const QA_TTL_START_COMMAND = "QA GO";

/** In the order the firmware runs them. */
export const QA_BOARD_TEST_IDS = [
  "power",
  "imu",
  "modem",
  "sim",
  "gsm",
  "wifi",
  "cell",
  "data",
  "steps",
  "gps",
] as const;

export type QaBoardTestId = (typeof QA_BOARD_TEST_IDS)[number];

export const QA_BOARD_TESTS: Record<QaBoardTestId, { label: string; description: string }> = {
  power: { label: "Battery", description: "Battery voltage is above the modem cut-off." },
  imu: { label: "Accelerometer", description: "LIS2DS12 answers on I2C with WHO_AM_I 0x43 and reads motion." },
  modem: { label: "Modem", description: "N706 answers AT after power-on." },
  sim: { label: "SIM", description: "SIM is ready; IMEI and ICCID are read." },
  gsm: { label: "GSM", description: "Registered on the network within the time limit from power-on." },
  wifi: { label: "Wi-Fi scan", description: "The modem's Wi-Fi scan sees at least one access point." },
  cell: { label: "Cell tower", description: "AT+NETDMSG returns a valid LTE serving cell." },
  data: { label: "Data link", description: "A data connection comes up with an IP address." },
  steps: { label: "Step counter", description: "The step interrupt counts while the board is walked or shaken." },
  gps: { label: "GPS", description: "NMEA arrives and a valid fix is found within the time limit from power-on." },
};

/** Firmware status words, kept short for the UART. */
export type QaTtlTestStatus = "running" | "pass" | "fail" | "skip";

type QaTtlBase = { v: typeof QA_TTL_PROTOCOL_VERSION; run: number; uid: string };

export type QaTtlMessage =
  /** Printed once at boot so a console opened later still knows the board. */
  | { v: typeof QA_TTL_PROTOCOL_VERSION; e: "boot"; uid: string; fw: string; uptimeMs: number }
  | (QaTtlBase & { e: "run"; fw: string; tests: QaBoardTestId[] })
  | (QaTtlBase & {
    e: "test";
    id: QaBoardTestId;
    status: QaTtlTestStatus;
    /** Time the test took, or the measured time-to-X for timed tests. */
    ms?: number;
    data?: Record<string, unknown>;
    error?: string;
  })
  /** Live progress while a test waits, e.g. "4 satellites" or "6/10 steps". */
  | (QaTtlBase & { e: "progress"; id: QaBoardTestId; text: string })
  /**
   * Something the operator must do now, e.g. walk the board. With `action: "start"` the
   * test waits until QA_TTL_START_COMMAND arrives, so the operator can pick the board up first.
   */
  | (QaTtlBase & { e: "prompt"; id: QaBoardTestId; text: string; timeoutMs: number; action?: "start" })
  | (QaTtlBase & { e: "done"; passed: number; failed: number; skipped: number; ms: number });

// ---------------------------------------------------------------------------
// Admin DTOs
// ---------------------------------------------------------------------------

export type QaTestResultStatus = "pending" | "running" | "passed" | "failed" | "skipped";

export type QaTestResultDto = {
  id: QaBoardTestId;
  status: QaTestResultStatus;
  ms: number | null;
  data: Record<string, unknown> | null;
  error: string | null;
  /** Latest progress or operator prompt while running. */
  progress: string | null;
  prompt: string | null;
  /** "start": the firmware waits for the operator to press Start (QA_TTL_START_COMMAND). */
  awaiting: "start" | null;
  startedAt: string | null;
  finishedAt: string | null;
};

/** aborted: the board rebooted, was unplugged or the agent disconnected mid-run. */
export type QaTestRunStatus = "running" | "passed" | "failed" | "aborted";

export type QaTestRunDto = {
  id: string;
  unitId: string | null;
  stationId: string | null;
  stationName: string | null;
  /** The TTL port the run was read from, and the bench slot that port belongs to. */
  serialPath: string | null;
  slotId: string | null;
  chipUid: string;
  firmwareVersion: string;
  runNumber: number;
  status: QaTestRunStatus;
  results: QaTestResultDto[];
  passed: number;
  failed: number;
  skipped: number;
  startedAt: string;
  finishedAt: string | null;
};

/** A unit's board tests across runs: a retry only replaces the tests it ran. */
export type QaBoardTestVerdictDto = {
  status: "passed" | "failed" | "pending";
  failing: QaBoardTestId[];
  untested: QaBoardTestId[];
};

export type QaStationTestRunDto = {
  run: QaTestRunDto | null;
  /** For the run's unit, when it has one. */
  verdict: QaBoardTestVerdictDto | null;
};
