import { describe, expect, it } from "vitest";

import {
  advanceGeofenceCandidate,
  REQUIRED_INSIDE_CONFIRMATION_SAMPLES,
  REQUIRED_OUTSIDE_CONFIRMATION_SAMPLES,
} from "./geofence-evaluator";

describe("advanceGeofenceCandidate", () => {
  it("requires four outside samples before confirming a breach", () => {
    let candidateState: Parameters<typeof advanceGeofenceCandidate>[0]["candidateState"] =
      "unknown";
    let candidateSampleCount = 0;

    for (let index = 1; index < REQUIRED_OUTSIDE_CONFIRMATION_SAMPLES; index += 1) {
      const next = advanceGeofenceCandidate({
        candidateSampleCount,
        candidateState,
        containmentState: "inside",
        sampleState: "outside",
      });

      expect(next.confirmedState).toBeNull();
      expect(next.candidateState).toBe("outside");
      expect(next.candidateSampleCount).toBe(index);

      candidateState = next.candidateState;
      candidateSampleCount = next.candidateSampleCount;
    }

    const confirmed = advanceGeofenceCandidate({
      candidateSampleCount,
      candidateState,
      containmentState: "inside",
      sampleState: "outside",
    });

    expect(confirmed.confirmedState).toBe("outside");
    expect(confirmed.candidateState).toBe("unknown");
    expect(confirmed.candidateSampleCount).toBe(0);
  });

  it("resets the outside candidate sequence when the direction changes", () => {
    const interrupted = advanceGeofenceCandidate({
      candidateSampleCount: 2,
      candidateState: "outside",
      containmentState: "inside",
      sampleState: "inside",
    });

    expect(interrupted.confirmedState).toBeNull();
    expect(interrupted.candidateState).toBe("unknown");
    expect(interrupted.candidateSampleCount).toBe(0);
  });

  it("confirms re-entry after two inside samples", () => {
    const firstInside = advanceGeofenceCandidate({
      candidateSampleCount: 0,
      candidateState: "unknown",
      containmentState: "outside",
      sampleState: "inside",
    });

    expect(firstInside.confirmedState).toBeNull();
    expect(firstInside.candidateState).toBe("inside");
    expect(firstInside.candidateSampleCount).toBe(1);

    const secondInside = advanceGeofenceCandidate({
      candidateSampleCount: firstInside.candidateSampleCount,
      candidateState: firstInside.candidateState,
      containmentState: "outside",
      sampleState: "inside",
    });

    expect(REQUIRED_INSIDE_CONFIRMATION_SAMPLES).toBe(2);
    expect(secondInside.confirmedState).toBe("inside");
    expect(secondInside.candidateState).toBe("unknown");
    expect(secondInside.candidateSampleCount).toBe(0);
  });
});
