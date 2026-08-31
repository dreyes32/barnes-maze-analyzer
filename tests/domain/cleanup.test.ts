import { describe, expect, it } from "vitest";
import { applyCleanup, applyManualCorrections, fillShortGaps } from "../../src/domain/cleanup";
import type { TrackingSample } from "../../src/domain/types";

function sample(time: number, body?: { x: number; y: number }, extra: Partial<TrackingSample> = {}): TrackingSample {
  return {
    timestampSeconds: time,
    body,
    confidence: body ? 0.9 : 0,
    status: body ? "tracked" : "failed",
    source: "automatic",
    ...extra,
  };
}

describe("cleanup", () => {
  it("interpolates short gaps and leaves long gaps missing", () => {
    const samples = [
      sample(0, { x: 0, y: 0 }),
      sample(0.1),
      sample(0.2, { x: 20, y: 0 }),
      sample(1.0, { x: 20, y: 0 }),
      sample(1.5),
      sample(2.0, { x: 40, y: 0 }),
    ];
    const filled = fillShortGaps(samples, 0.25);
    expect(filled[1].source).toBe("interpolated");
    expect(filled[1].body?.x).toBeCloseTo(10);
    expect(filled[4].status).toBe("failed");
    expect(filled[4].body).toBeUndefined();
  });

  it("never overwrites a manual point", () => {
    const samples = [
      sample(0, { x: 0, y: 0 }),
      sample(0.1, { x: 99, y: 99 }, { source: "manual", status: "tracked", confidence: 1 }),
      sample(0.2, { x: 20, y: 0 }),
    ];
    const cleaned = applyCleanup(samples, {
      gapFill: "short",
      maxGapSeconds: 1,
      smoothing: "moving-median",
      smoothingWindow: 5,
      outlierRule: "robust-speed",
      outlierMultiplier: 6,
    });
    expect(cleaned.samples[1].source).toBe("manual");
    expect(cleaned.samples[1].body).toEqual({ x: 99, y: 99 });
  });

  it("applies manual corrections without destroying the raw array", () => {
    const raw = [sample(0, { x: 1, y: 1 }), sample(0.1, { x: 2, y: 2 })];
    const effective = applyManualCorrections(raw, [
      { timestampSeconds: 0.1, kind: "body-position", correctedValue: { x: 8, y: 9 } },
    ]);
    expect(raw[1].body).toEqual({ x: 2, y: 2 });
    expect(effective[1].source).toBe("manual");
    expect(effective[1].body).toEqual({ x: 8, y: 9 });
  });

  it("inserts a source-frame correction at its actual timestamp", () => {
    const raw = [sample(0, { x: 1, y: 1 }), sample(0.1, { x: 2, y: 2 })];
    const effective = applyManualCorrections(raw, [
      { timestampSeconds: 0.033, kind: "body-position", correctedValue: { x: 5, y: 6 } },
    ]);
    expect(effective).toHaveLength(3);
    expect(effective[1].timestampSeconds).toBeCloseTo(0.033);
    expect(effective[1].source).toBe("manual");
    expect(effective[1].body).toEqual({ x: 5, y: 6 });
    expect(raw).toHaveLength(2);
  });
});
