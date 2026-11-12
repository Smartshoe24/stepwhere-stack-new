import { describe, expect, it } from "vitest";
import type { QaAgentJob, QaAgentToServerMessage } from "@stepwhere/types";
import { JobRunner } from "../src/jobs.js";
import type { ProgrammerRun, RunOptions } from "../src/programmer.js";

type Frame = QaAgentToServerMessage;

type FakeCall = {
  args: string[];
  options: RunOptions;
  finish: (run?: Partial<ProgrammerRun>) => void;
};

const IDENTIFY_OUTPUT = [
  "Device ID   : 0x460",
  "Device name : STM32G071/STM32G081",
  "0x1FFF7590 : 00390029 3A2F5143 91C40000",
];

function setup() {
  const frames: Frame[] = [];
  const busy: boolean[] = [];
  const calls: FakeCall[] = [];
  const runCli = (args: string[], options: RunOptions = {}): Promise<ProgrammerRun> =>
    new Promise((resolve) => {
      const call: FakeCall = {
        args,
        options,
        finish: (run) => resolve({ exitCode: 0, lines: IDENTIFY_OUTPUT, timedOut: false, aborted: false, ...run }),
      };
      options.signal?.addEventListener("abort", () => call.finish({ exitCode: null, lines: [], aborted: true }), { once: true });
      calls.push(call);
    });
  const runner = new JobRunner((m) => frames.push(m), (b) => busy.push(b), runCli);
  return { runner, frames, busy, calls };
}

function identifyJob(id: string, probeSerial: string | null): QaAgentJob {
  return { id, kind: "identify", probeSerial, connectMode: "normal", firmware: null };
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function results(frames: Frame[]): Array<Extract<Frame, { type: "job.result" }>["data"]> {
  return frames.flatMap((f) => (f.type === "job.result" ? [f.data] : []));
}

function accepted(frames: Frame[]): string[] {
  return frames.flatMap((f) => (f.type === "job.accepted" ? [f.data.jobId] : []));
}

describe("JobRunner concurrency", () => {
  it("runs jobs on different probes in parallel without queueing behind each other", async () => {
    const { runner, frames, calls } = setup();
    runner.start(identifyJob("job-a", "AAAA1111"));
    runner.start(identifyJob("job-b", "BBBB2222"));
    await tick();
    expect(accepted(frames)).toEqual(["job-a", "job-b"]);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.args).toContain("sn=AAAA1111");
    expect(calls[1]?.args).toContain("sn=BBBB2222");
    expect(calls.every((c) => c.options.exclusive === false)).toBe(true);

    calls[1]?.finish();
    await tick();
    expect(results(frames).map((r) => [r.jobId, r.ok])).toEqual([["job-b", true]]);
    expect(runner.isBusy()).toBe(true);
    calls[0]?.finish();
    await tick();
    expect(results(frames).map((r) => r.jobId)).toEqual(["job-b", "job-a"]);
    expect(runner.isBusy()).toBe(false);
  });

  it("rejects a job on a probe that is already in use", async () => {
    const { runner, frames, calls } = setup();
    runner.start(identifyJob("job-a", "AAAA1111"));
    runner.start(identifyJob("job-b", "AAAA1111"));
    await tick();
    expect(accepted(frames)).toEqual(["job-a"]);
    const rejected = results(frames);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.jobId).toBe("job-b");
    expect(rejected[0]?.ok).toBe(false);
    expect(rejected[0]?.result.error).toBe("ST-LINK AAAA1111 is busy with another job.");
    expect(calls).toHaveLength(1);
    calls[0]?.finish();
    await tick();

    // The probe is free again afterwards.
    runner.start(identifyJob("job-c", "AAAA1111"));
    await tick();
    expect(accepted(frames)).toEqual(["job-a", "job-c"]);
    calls[1]?.finish();
    await tick();
  });

  it("rejects a no-probe job while another job runs", async () => {
    const { runner, frames, calls } = setup();
    runner.start(identifyJob("job-a", "AAAA1111"));
    runner.start(identifyJob("job-any", null));
    await tick();
    expect(accepted(frames)).toEqual(["job-a"]);
    expect(results(frames)[0]?.jobId).toBe("job-any");
    expect(results(frames)[0]?.result.error).toBe("Agent is busy with another job. Pick an ST-LINK to run jobs side by side.");
    expect(calls).toHaveLength(1);
    calls[0]?.finish();
    await tick();
  });

  it("rejects any job while a no-probe job runs", async () => {
    const { runner, frames, calls } = setup();
    runner.start(identifyJob("job-any", null));
    runner.start(identifyJob("job-a", "AAAA1111"));
    runner.start(identifyJob("job-any2", null));
    await tick();
    expect(accepted(frames)).toEqual(["job-any"]);
    expect(results(frames).map((r) => [r.jobId, r.result.error])).toEqual([
      ["job-a", "Agent is busy with another job. Pick an ST-LINK to run jobs side by side."],
      ["job-any2", "Agent is busy with another job. Pick an ST-LINK to run jobs side by side."],
    ]);
    calls[0]?.finish();
    await tick();
    expect(runner.isBusy()).toBe(false);
  });

  it("ignores a duplicate job id that is already running", async () => {
    const { runner, frames, calls } = setup();
    runner.start(identifyJob("job-a", "AAAA1111"));
    runner.start(identifyJob("job-a", "BBBB2222"));
    await tick();
    expect(accepted(frames)).toEqual(["job-a"]);
    expect(results(frames)).toHaveLength(0);
    expect(calls).toHaveLength(1);
    calls[0]?.finish();
    await tick();
  });

  it("cancels only the targeted job", async () => {
    const { runner, frames, calls } = setup();
    runner.start(identifyJob("job-a", "AAAA1111"));
    runner.start(identifyJob("job-b", "BBBB2222"));
    await tick();
    runner.cancel("job-a");
    await tick();
    expect(calls[0]?.options.signal?.aborted).toBe(true);
    expect(calls[1]?.options.signal?.aborted).toBe(false);
    const done = results(frames);
    expect(done.map((r) => r.jobId)).toEqual(["job-a"]);
    expect(done[0]?.ok).toBe(false);
    expect(done[0]?.result.error).toBe("Cancelled from the admin panel.");
    expect(runner.isBusy()).toBe(true);

    runner.cancel("unknown-job");
    expect(calls[1]?.options.signal?.aborted).toBe(false);
    calls[1]?.finish();
    await tick();
    expect(results(frames).map((r) => [r.jobId, r.ok])).toEqual([
      ["job-a", false],
      ["job-b", true],
    ]);
  });

  it("aborts every running job on abortAll", async () => {
    const { runner, calls } = setup();
    runner.start(identifyJob("job-a", "AAAA1111"));
    runner.start(identifyJob("job-b", "BBBB2222"));
    await tick();
    runner.abortAll();
    expect(calls.map((c) => c.options.signal?.aborted)).toEqual([true, true]);
    await tick();
    expect(runner.isBusy()).toBe(false);
  });

  it("reports busy only on the 0 to 1 and 1 to 0 transitions", async () => {
    const { runner, busy, calls } = setup();
    expect(runner.isBusy()).toBe(false);
    runner.start(identifyJob("job-a", "AAAA1111"));
    runner.start(identifyJob("job-b", "BBBB2222"));
    await tick();
    expect(busy).toEqual([true]);
    calls[0]?.finish();
    await tick();
    expect(busy).toEqual([true]);
    expect(runner.isBusy()).toBe(true);
    calls[1]?.finish();
    await tick();
    expect(busy).toEqual([true, false]);
    expect(runner.isBusy()).toBe(false);

    runner.start(identifyJob("job-c", null));
    await tick();
    calls[2]?.finish();
    await tick();
    expect(busy).toEqual([true, false, true, false]);
  });

  it("does not call onBusyChange for rejected jobs", async () => {
    const { runner, busy, calls } = setup();
    runner.start(identifyJob("job-a", "AAAA1111"));
    runner.start(identifyJob("job-b", "AAAA1111"));
    await tick();
    calls[0]?.finish();
    await tick();
    expect(busy).toEqual([true, false]);
  });
});
