import { z } from "zod";
import { QA_BOARD_TEST_IDS, QA_TTL_PREFIX, QA_TTL_PROTOCOL_VERSION } from "@stepwhere/types";
import type {
  QaBoardTestId,
  QaTestResultDto,
  QaTestResultStatus,
  QaTtlMessage,
  QaTtlTestStatus,
} from "@stepwhere/types";

/** A JSON line longer than this is a corrupted or hostile line, not a firmware message. */
export const QA_TTL_MAX_LINE_CHARS = 1024;

const testId = z.enum(QA_BOARD_TEST_IDS);
const uid = z.string().regex(/^[0-9A-Fa-f]{24}$/).transform((value) => value.toUpperCase());
const base = {
  v: z.literal(QA_TTL_PROTOCOL_VERSION),
  run: z.number().int().min(0).max(1_000_000),
  uid,
};
const shortText = (max: number) => z.string().max(max);
const data = z.record(z.string().max(40), z.union([
  z.string().max(160),
  z.number().finite(),
  z.boolean(),
  z.null(),
])).refine((value) => Object.keys(value).length <= 24, "too many fields");

const messageSchema = z.discriminatedUnion("e", [
  z.object({
    v: z.literal(QA_TTL_PROTOCOL_VERSION),
    e: z.literal("boot"),
    uid,
    fw: shortText(40),
    uptimeMs: z.number().int().nonnegative(),
  }),
  z.object({ ...base, e: z.literal("run"), fw: shortText(40), tests: z.array(testId).min(1).max(QA_BOARD_TEST_IDS.length) }),
  z.object({
    ...base,
    e: z.literal("test"),
    id: testId,
    status: z.enum(["running", "pass", "fail", "skip"]),
    ms: z.number().int().nonnegative().max(86_400_000).optional(),
    data: data.optional(),
    error: shortText(160).optional(),
  }),
  z.object({ ...base, e: z.literal("progress"), id: testId, text: shortText(120) }),
  z.object({
    ...base,
    e: z.literal("prompt"),
    id: testId,
    text: shortText(160),
    timeoutMs: z.number().int().nonnegative(),
    action: z.literal("start").optional(),
  }),
  z.object({
    ...base,
    e: z.literal("done"),
    passed: z.number().int().min(0).max(100),
    failed: z.number().int().min(0).max(100),
    skipped: z.number().int().min(0).max(100),
    ms: z.number().int().nonnegative(),
  }),
]);

/** The QA firmware message on a TTL line, or null for ordinary log output. */
export function parseQaTtlLine(text: string): QaTtlMessage | null {
  const start = text.indexOf(QA_TTL_PREFIX);

  if (start < 0) {
    return null;
  }

  const json = text.slice(start + QA_TTL_PREFIX.length).trim();

  if (json.length === 0 || json.length > QA_TTL_MAX_LINE_CHARS || json[0] !== "{") {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  const result = messageSchema.safeParse(parsed);

  return result.success ? (result.data as QaTtlMessage) : null;
}

const STATUS_FROM_TTL: Record<QaTtlTestStatus, QaTestResultStatus> = {
  running: "running",
  pass: "passed",
  fail: "failed",
  skip: "skipped",
};

export function emptyResults(tests: readonly QaBoardTestId[]): QaTestResultDto[] {
  return tests.map((id) => ({
    id,
    status: "pending",
    ms: null,
    data: null,
    error: null,
    progress: null,
    prompt: null,
    awaiting: null,
    startedAt: null,
    finishedAt: null,
  }));
}

/** Applies one firmware message to a run's results. Returns a new array. */
export function applyTtlMessage(results: QaTestResultDto[], message: QaTtlMessage, at: Date): QaTestResultDto[] {
  if (message.e !== "test" && message.e !== "progress" && message.e !== "prompt") {
    return results;
  }

  const list = results.some((entry) => entry.id === message.id)
    ? results
    : [...results, ...emptyResults([message.id])];
  const now = at.toISOString();

  return list.map((entry) => {
    if (entry.id !== message.id) {
      return entry;
    }

    if (message.e === "progress") {
      return { ...entry, status: entry.status === "pending" ? "running" : entry.status, progress: message.text };
    }

    if (message.e === "prompt") {
      return {
        ...entry,
        status: entry.status === "pending" ? "running" : entry.status,
        prompt: message.text,
        awaiting: message.action ?? null,
      };
    }

    const status = STATUS_FROM_TTL[message.status];

    if (status === "running") {
      return { ...entry, status, startedAt: entry.startedAt ?? now, progress: null, prompt: null, awaiting: null };
    }

    return {
      ...entry,
      status,
      ms: message.ms ?? null,
      data: message.data ?? null,
      error: message.error ?? null,
      progress: null,
      prompt: null,
      awaiting: null,
      startedAt: entry.startedAt ?? now,
      finishedAt: now,
    };
  });
}

export function countResults(results: QaTestResultDto[]) {
  return {
    passed: results.filter((entry) => entry.status === "passed").length,
    failed: results.filter((entry) => entry.status === "failed").length,
    skipped: results.filter((entry) => entry.status === "skipped").length,
  };
}

export type BoardTestVerdict = {
  status: "passed" | "failed" | "pending";
  /** Latest outcome per test, newest run first, back to the last full run. */
  latest: Map<QaBoardTestId, QaTestResultStatus>;
  failing: QaBoardTestId[];
  untested: QaBoardTestId[];
};

/**
 * A unit's board tests, from its finished runs (newest first). A retry of one
 * test only replaces that test's result, so the verdict walks back to the last
 * run that covered every test. Skipped counts as not tested.
 */
export function combineBoardTestRuns(runs: Array<{ results: QaTestResultDto[] }>): BoardTestVerdict {
  const latest = new Map<QaBoardTestId, QaTestResultStatus>();

  for (const run of runs) {
    for (const result of run.results) {
      if (!latest.has(result.id) && (result.status === "passed" || result.status === "failed")) {
        latest.set(result.id, result.status);
      }
    }

    if (QA_BOARD_TEST_IDS.every((id) => run.results.some((result) => result.id === id))) {
      break;
    }
  }

  const failing = QA_BOARD_TEST_IDS.filter((id) => latest.get(id) === "failed");
  const untested = QA_BOARD_TEST_IDS.filter((id) => !latest.has(id));
  const status = failing.length > 0 ? "failed" : untested.length > 0 ? "pending" : "passed";

  return { status, latest, failing, untested };
}
