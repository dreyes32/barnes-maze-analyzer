import { describe, expect, it } from "vitest";
import { applyCleanup, applyManualCorrections } from "../../src/domain/cleanup";
import { DEFAULT_PARAMETERS } from "../../src/domain/defaults";
import { createAssistedArena } from "../../src/domain/geometry";
import { deriveReviewStatus } from "../../src/domain/pipeline";
import { buildReviewIssues, computeQc } from "../../src/domain/qc";
import type { TrackingSample, TrialRecord } from "../../src/domain/types";

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

describe("stale escape after target change", () => {
  it("flags a manual escape that no longer matches the current target", () => {
    const arena = {
      ...createAssistedArena({
        platformCenterPx: { x: 0, y: 0 },
        platformEdgePx: { x: 100, y: 0 },
        firstHolePx: { x: 80, y: 0 },
        targetHoleIndex: 7,
      }),
    };
    const trial = {
      id: "test50",
      events: [
        {
          id: "esc",
          type: "escape-entry",
          holeIndex: 0,
          startSeconds: 184.583,
          confidence: 1,
          evidence: ["manually marked escape entry"],
          source: "manual",
        },
      ],
      arena,
      corrections: [],
    } as unknown as TrialRecord;
    const issues = buildReviewIssues(trial);
    expect(issues.some((issue) => issue.kind === "stale-escape")).toBe(true);
    expect(issues[0]?.summary).toMatch(/Hole 1.*Hole 8/);
  });

  it("reopens a completed trial when the stored escape no longer matches the target", () => {
    const arena = {
      ...createAssistedArena({
        platformCenterPx: { x: 0, y: 0 },
        platformEdgePx: { x: 100, y: 0 },
        firstHolePx: { x: 80, y: 0 },
        targetHoleIndex: 7,
      }),
    };
    const trial = {
      id: "test50",
      events: [
        {
          id: "esc",
          type: "escape-entry",
          holeIndex: 0,
          startSeconds: 184.583,
          confidence: 1,
          evidence: ["manually marked escape entry"],
          source: "manual",
        },
      ],
      arena,
      tracking: { rawSamples: [{}], cancelled: false },
      reviewStatus: "complete",
    } as unknown as TrialRecord;
    expect(deriveReviewStatus(trial)).toBe("needs-review");
  });
});
