import { describe, expect, it } from "vitest";
import { applyCleanup, applyManualCorrections } from "../../src/domain/cleanup";
import { DEFAULT_PARAMETERS } from "../../src/domain/defaults";
import { computeQc } from "../../src/domain/qc";
import type { TrackingSample } from "../../src/domain/types";

function sample(time: number, body?: { x: number; y: number }, extra: Partial<TrackingSample> = {}): TrackingSample {
  return {
    timestampSeconds: time,
    analysisSampleIndex: Math.round(time * 10),
    body,
    confidence: body ? 0.9 : 0,
    status: body ? "tracked" : "failed",
    source: "automatic",
    ...extra,
  };
}

describe("automatic vs effective coverage", () => {
  it("lets interpolation raise effective coverage without changing automatic coverage", () => {
    const raw = [
      sample(0, { x: 0, y: 0 }),
      sample(0.1),
      sample(0.2, { x: 20, y: 0 }),
    ];
    const cleaned = applyCleanup(raw, {
      ...DEFAULT_PARAMETERS.cleanup,
      gapFill: "short",
      maxGapSeconds: 0.25,
      outlierRule: "none",
    });
    const qc = computeQc(cleaned.samples, raw);
    expect(qc.automaticTrackingCoveragePercent).toBeCloseTo((2 / 3) * 100);
    expect(qc.effectiveTrajectoryCoveragePercent).toBeCloseTo(100);
    expect(qc.effectiveTrajectoryCoveragePercent).toBeGreaterThan(qc.automaticTrackingCoveragePercent ?? 0);
  });

  it("lets a manual correction raise effective coverage without changing automatic coverage", () => {
    const raw = [sample(0, { x: 0, y: 0 }), sample(0.1), sample(0.2, { x: 20, y: 0 })];
    const effective = applyManualCorrections(raw, [
      { timestampSeconds: 0.1, kind: "body-position", correctedValue: { x: 10, y: 0 } },
    ]);
    const qc = computeQc(effective, raw);
    expect(qc.automaticTrackingCoveragePercent).toBeCloseTo((2 / 3) * 100);
    expect(qc.effectiveTrajectoryCoveragePercent).toBeCloseTo(100);
    expect(qc.manual).toBe(1);
  });
});
