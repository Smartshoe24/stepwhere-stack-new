import { describe, expect, it } from "vitest";

import { applyTtlMessage, combineBoardTestRuns, countResults, emptyResults, parseQaTtlLine } from "./qa-tests.helpers";

const UID = "005500313434510231303739";

// Lines exactly as apps/firmware/stepwhere.qa.ino prints them.
const lines = {
  boot: `@QA {"v":1,"e":"boot","uid":"${UID}","fw":"qa-0.1.0","uptimeMs":201}`,
  run: `@QA {"v":1,"e":"run","run":1,"uid":"${UID}","fw":"qa-0.1.0","tests":["power","imu","modem","sim","gsm","wifi","cell","data","steps","gps"]}`,
  running: `@QA {"v":1,"e":"test","run":1,"uid":"${UID}","id":"gsm","status":"running"}`,
  gsm: `@QA {"v":1,"e":"test","run":1,"uid":"${UID}","id":"gsm","status":"pass","ms":8120,"data":{"registerMs":8120,"limitMs":15000,"csq":20,"rssiDbm":-73}}`,
  gpsFail: `@QA {"v":1,"e":"test","run":1,"uid":"${UID}","id":"gps","status":"fail","ms":420003,"error":"No valid fix within 7 min (antenna or sky view)","data":{"limitMs":420000,"satellites":2,"nmeaChars":51234,"badChecksums":0}}`,
  progress: `@QA {"v":1,"e":"progress","run":1,"uid":"${UID}","id":"steps","text":"6/10 steps · 41 s left"}`,
  prompt: `@QA {"v":1,"e":"prompt","run":1,"uid":"${UID}","id":"steps","text":"Walk with the board, or swing it like a step, 20 times","timeoutMs":60000}`,
  done: `@QA {"v":1,"e":"done","run":1,"uid":"${UID}","passed":9,"failed":1,"skipped":0,"ms":431220}`,
};

describe("parseQaTtlLine", () => {
  it("reads every message the firmware prints", () => {
    expect(parseQaTtlLine(lines.boot)).toMatchObject({ e: "boot", uid: UID, fw: "qa-0.1.0" });
    expect(parseQaTtlLine(lines.run)).toMatchObject({ e: "run", run: 1, tests: expect.arrayContaining(["gps"]) });
    expect(parseQaTtlLine(lines.gsm)).toMatchObject({ e: "test", id: "gsm", status: "pass", ms: 8120, data: { csq: 20 } });
    expect(parseQaTtlLine(lines.gpsFail)).toMatchObject({ id: "gps", status: "fail", error: expect.stringContaining("7 min") });
    expect(parseQaTtlLine(lines.progress)).toMatchObject({ e: "progress", id: "steps" });
    expect(parseQaTtlLine(lines.prompt)).toMatchObject({ e: "prompt", timeoutMs: 60000 });
    expect(parseQaTtlLine(lines.done)).toMatchObject({ e: "done", passed: 9, failed: 1 });
  });

  it("tolerates a timestamp or CR around the message and upper-cases the UID", () => {
    const lower = lines.running.replace(UID, UID.toLowerCase().replace(/3/g, "a"));
    expect(parseQaTtlLine(`12:00:01.123 ${lower}\r`)).toMatchObject({ uid: UID.replace(/3/g, "A") });
  });

  it("ignores ordinary log lines and malformed or unknown messages", () => {
    expect(parseQaTtlLine("[QA] gsm PASS (8120 ms)")).toBeNull();
    expect(parseQaTtlLine("[AT] << +CEREG: 0,1")).toBeNull();
    expect(parseQaTtlLine("@QA {not json")).toBeNull();
    expect(parseQaTtlLine(lines.gsm.replace('"v":1', '"v":2'))).toBeNull();
    expect(parseQaTtlLine(lines.gsm.replace('"gsm"', '"bluetooth"'))).toBeNull();
    expect(parseQaTtlLine(lines.gsm.replace(UID, "XYZ"))).toBeNull();
    expect(parseQaTtlLine(`@QA ${JSON.stringify({ v: 1, e: "test", run: 1, uid: UID, id: "gsm", status: "pass", data: { nested: { a: 1 } } })}`)).toBeNull();
    expect(parseQaTtlLine(`@QA {"v":1,"e":"progress","run":1,"uid":"${UID}","id":"gps","text":"${"x".repeat(2000)}"}`)).toBeNull();
  });
});

describe("applyTtlMessage", () => {
  const at = new Date("2026-10-20T10:00:00Z");
  const later = new Date("2026-10-20T10:00:08Z");

  it("moves a test from pending to running to a result", () => {
    let results = emptyResults(["gsm", "gps"]);
    results = applyTtlMessage(results, parseQaTtlLine(lines.running)!, at);
    expect(results[0]).toMatchObject({ id: "gsm", status: "running", startedAt: at.toISOString() });

    results = applyTtlMessage(results, parseQaTtlLine(lines.gsm)!, later);
    expect(results[0]).toMatchObject({
      status: "passed",
      ms: 8120,
      data: { registerMs: 8120, limitMs: 15000, csq: 20, rssiDbm: -73 },
      startedAt: at.toISOString(),
      finishedAt: later.toISOString(),
    });
    expect(results[1].status).toBe("pending");
  });

  it("keeps progress and prompts until the result clears them", () => {
    let results = emptyResults(["steps"]);
    results = applyTtlMessage(results, parseQaTtlLine(lines.prompt)!, at);
    results = applyTtlMessage(results, parseQaTtlLine(lines.progress)!, at);
    expect(results[0]).toMatchObject({ status: "running", prompt: expect.stringContaining("Walk"), progress: expect.stringContaining("6/10") });

    const pass = parseQaTtlLine(`@QA {"v":1,"e":"test","run":1,"uid":"${UID}","id":"steps","status":"pass","ms":21000,"data":{"steps":10}}`)!;
    results = applyTtlMessage(results, pass, later);
    expect(results[0]).toMatchObject({ status: "passed", prompt: null, progress: null });
  });

  it("marks a test that waits for the operator to press Start, until counting begins", () => {
    const wait = parseQaTtlLine(`@QA {"v":1,"e":"prompt","run":1,"uid":"${UID}","id":"steps","text":"Pick up the board, then press Start","timeoutMs":600000,"action":"start"}`)!;
    let results = applyTtlMessage(emptyResults(["steps"]), wait, at);
    expect(results[0]).toMatchObject({ status: "running", awaiting: "start" });

    results = applyTtlMessage(results, parseQaTtlLine(lines.prompt)!, later);
    expect(results[0]).toMatchObject({ awaiting: null, prompt: expect.stringContaining("Walk") });
  });

  it("adds a test the run did not announce, and counts outcomes", () => {
    const results = applyTtlMessage(emptyResults(["gsm"]), parseQaTtlLine(lines.gpsFail)!, at);
    expect(results.map((entry) => entry.id)).toEqual(["gsm", "gps"]);
    expect(countResults(results)).toEqual({ passed: 0, failed: 1, skipped: 0 });
  });
});

describe("combineBoardTestRuns", () => {
  const ids = ["power", "imu", "modem", "sim", "gsm", "wifi", "cell", "data", "steps", "gps"] as const;
  const full = (overrides: Partial<Record<(typeof ids)[number], "passed" | "failed" | "skipped">> = {}) => ({
    results: emptyResults(ids).map((entry) => ({ ...entry, status: overrides[entry.id] ?? "passed" })),
  });
  const partial = (statuses: Partial<Record<(typeof ids)[number], "passed" | "failed" | "skipped">>) => ({
    results: emptyResults(Object.keys(statuses) as (typeof ids)[number][]).map((entry) => ({ ...entry, status: statuses[entry.id]! })),
  });

  it("passes a full run with every test passing", () => {
    expect(combineBoardTestRuns([full()]).status).toBe("passed");
  });

  it("lets a retry replace only the retried test", () => {
    const verdict = combineBoardTestRuns([partial({ power: "passed", gps: "passed" }), full({ gps: "failed", wifi: "failed" })]);
    expect(verdict.status).toBe("failed");
    expect(verdict.failing).toEqual(["wifi"]);

    expect(combineBoardTestRuns([partial({ wifi: "passed" }), partial({ gps: "passed" }), full({ gps: "failed", wifi: "failed" })]).status).toBe("passed");
  });

  it("ignores runs before the last full run", () => {
    expect(combineBoardTestRuns([full(), full({ gps: "failed" })]).status).toBe("passed");
  });

  it("is pending until every test has a result, and treats skipped as untested", () => {
    expect(combineBoardTestRuns([partial({ gps: "passed" })]).status).toBe("pending");
    const verdict = combineBoardTestRuns([full({ cell: "skipped", data: "skipped" })]);
    expect(verdict).toMatchObject({ status: "pending", untested: ["cell", "data"] });
  });
});
