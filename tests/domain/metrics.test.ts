import { describe, expect, it } from "vitest";
import { createAssistedArena } from "../../src/domain/geometry";
import { computeMetrics } from "../../src/domain/metrics";
import type { BehavioralEvent, TrackingSample } from "../../src/domain/types";

const arena = {
  ...createAssistedArena({
    platformCenterPx: { x: 0, y: 0 },
    platformEdgePx: { x: 100, y: 0 },
    firstHolePx: { x: 80, y: 0 },
    targetHoleIndex: 0,
  }),
  platformDiameterCm: 100,
};

describe("metrics", () => {
  it("computes primary latency and errors from target investigation", () => {
    const events: BehavioralEvent[] = [
      {
        id: "a",
        type: "hole-investigation",
        holeIndex: 3,
        startSeconds: 2,
        confidence: 0.8,
        evidence: [],
        source: "automatic",
      },
      {
        id: "b",
        type: "target-investigation",
        holeIndex: 0,
        startSeconds: 5,
        confidence: 0.8,
        evidence: [],
        source: "automatic",
      },
    ];
    const metrics = computeMetrics({ samples: [], events, arena, trialStartSeconds: 0 });
    expect(metrics.primaryLatencySeconds).toBe(5);
    expect(metrics.primaryErrors).toBe(1);
    expect(metrics.totalLatencySeconds).toBeNull();
  });

  it("uses escape for total latency and does not invent values", () => {
    const events: BehavioralEvent[] = [
      {
        id: "t",
        type: "target-investigation",
        holeIndex: 0,
        startSeconds: 3,
        confidence: 1,
        evidence: [],
        source: "automatic",
      },
      {
        id: "e",
        type: "escape-entry",
        holeIndex: 0,
        startSeconds: 8,
        confidence: 0.9,
        evidence: [],
        source: "automatic-confirmed",
      },
    ];
    const metrics = computeMetrics({ samples: [], events, arena, trialStartSeconds: 1 });
    expect(metrics.totalLatencySeconds).toBe(7);
  });

  it("computes path length and speed from real timestamp deltas", () => {
    const samples: TrackingSample[] = [
      { timestampSeconds: 0, body: { x: 0, y: 0 }, confidence: 1, status: "tracked", source: "automatic" },
      { timestampSeconds: 2, body: { x: 200, y: 0 }, confidence: 1, status: "tracked", source: "automatic" },
    ];
    const metrics = computeMetrics({ samples, events: [], arena });
    expect(metrics.pathLengthCm).toBeCloseTo(100);
    expect(metrics.meanSpeedCmPerSec).toBeCloseTo(50);
  });

  it("uses time-weighted mean speed, not the unweighted mean of segment speeds", () => {
    const samples: TrackingSample[] = [
      { timestampSeconds: 0, body: { x: 0, y: 0 }, confidence: 1, status: "tracked", source: "automatic" },
      { timestampSeconds: 1, body: { x: 100, y: 0 }, confidence: 1, status: "tracked", source: "automatic" },
      { timestampSeconds: 4, body: { x: 130, y: 0 }, confidence: 1, status: "tracked", source: "automatic" },
    ];
    const metrics = computeMetrics({ samples, events: [], arena });
    expect(metrics.pathLengthCm).toBeCloseTo(65);
    expect(metrics.meanSpeedCmPerSec).toBeCloseTo(16.25);
    expect(metrics.medianSpeedCmPerSec).toBeCloseTo(27.5);
  });

  it("does not connect a failed gap as path length", () => {
    const samples: TrackingSample[] = [
      { timestampSeconds: 0, body: { x: 0, y: 0 }, confidence: 1, status: "tracked", source: "automatic" },
      { timestampSeconds: 1, confidence: 0, status: "failed", source: "automatic" },
      { timestampSeconds: 2, body: { x: 200, y: 0 }, confidence: 1, status: "tracked", source: "automatic" },
    ];
    const metrics = computeMetrics({ samples, events: [], arena });
    expect(metrics.pathLengthPx).toBe(0);
  });

  it("measures target quadrant dwell from observation timestamps", () => {
    const target = arena.holeCentersPx[0];
    const opposite = arena.holeCentersPx[10];
    const samples: TrackingSample[] = [
      { timestampSeconds: 0, body: target, confidence: 1, status: "tracked", source: "automatic" },
      { timestampSeconds: 1, body: target, confidence: 1, status: "tracked", source: "automatic" },
      { timestampSeconds: 2, body: opposite, confidence: 1, status: "tracked", source: "automatic" },
      { timestampSeconds: 3, body: opposite, confidence: 1, status: "tracked", source: "automatic" },
    ];
    const metrics = computeMetrics({ samples, events: [], arena });
    expect(metrics.targetQuadrantTimeSeconds).toBeCloseTo(1);
    expect(metrics.targetQuadrantPercent).toBeCloseTo(100 / 3);
  });

  it("does not use an escape recorded for a different target hole", () => {
    const events: BehavioralEvent[] = [
      {
        id: "t",
        type: "target-investigation",
        holeIndex: 7,
        startSeconds: 9.25,
        confidence: 0.9,
        evidence: [],
        source: "automatic",
      },
      {
        id: "e",
        type: "escape-entry",
        holeIndex: 0,
        startSeconds: 184.583,
        confidence: 1,
        evidence: ["manually marked escape entry"],
        source: "manual",
      },
    ];
    const metrics = computeMetrics({
      samples: [],
      events,
      arena: { ...arena, targetHoleIndex: 7 },
      trialStartSeconds: 0,
    });
    expect(metrics.totalLatencySeconds).toBeNull();
    expect(metrics.unavailableReasons.some((reason) => reason.includes("Hole 1") && reason.includes("Hole 8"))).toBe(
      true,
    );
  });

  it("uses a matching escape when a stale escape for another hole is also present", () => {
    const events: BehavioralEvent[] = [
      {
        id: "old",
        type: "escape-entry",
        holeIndex: 0,
        startSeconds: 10,
        confidence: 1,
        evidence: [],
        source: "manual",
      },
      {
        id: "fresh",
        type: "escape-entry",
        holeIndex: 7,
        startSeconds: 20,
        confidence: 1,
        evidence: [],
        source: "manual",
      },
    ];
    const metrics = computeMetrics({
      samples: [],
      events,
      arena: { ...arena, targetHoleIndex: 7 },
      trialStartSeconds: 0,
    });
    expect(metrics.totalLatencySeconds).toBe(20);
    expect(metrics.unavailableReasons.some((reason) => reason.includes("current target"))).toBe(false);
  });
});
