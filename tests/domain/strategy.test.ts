import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS } from "../../src/domain/defaults";
import { createAssistedArena } from "../../src/domain/geometry";
import { computeStrategy } from "../../src/domain/strategy";
import type { BehavioralEvent, TrackingSample } from "../../src/domain/types";

const arena = createAssistedArena({
  platformCenterPx: { x: 0, y: 0 },
  platformEdgePx: { x: 100, y: 0 },
  firstHolePx: { x: 80, y: 0 },
  targetHoleIndex: 0,
});

function visit(holeIndex: number, time: number): BehavioralEvent {
  return {
    id: `v${holeIndex}-${time}`,
    type: holeIndex === 0 ? "target-investigation" : "hole-investigation",
    holeIndex,
    startSeconds: time,
    confidence: 0.8,
    evidence: [],
    source: "automatic",
  };
}

describe("strategy", () => {
  it("classifies a direct path as spatial", () => {
    const samples: TrackingSample[] = [
      { timestampSeconds: 0, body: { x: 0, y: 0 }, confidence: 1, status: "tracked", source: "automatic" },
      { timestampSeconds: 1, body: arena.holeCentersPx[0], confidence: 1, status: "tracked", source: "automatic" },
    ];
    const result = computeStrategy({
      samples,
      events: [visit(0, 1)],
      arena,
      metrics: {
        primaryLatencySeconds: 1,
        primaryErrors: 0,
        unavailableReasons: [],
      },
      parameters: DEFAULT_PARAMETERS.strategy,
    });
    expect(result.automatic).toBe("spatial");
  });

  it("classifies adjacent hole-by-hole search as serial, including 20 → 1", () => {
    const events = [16, 17, 18, 19, 0].map((hole, index) => visit(hole, index + 1));
    const samples: TrackingSample[] = events.map((event) => ({
      timestampSeconds: event.startSeconds,
      body: arena.holeCentersPx[event.holeIndex ?? 0],
      confidence: 1,
      status: "tracked" as const,
      source: "automatic" as const,
    }));
    const result = computeStrategy({
      samples,
      events,
      arena,
      metrics: { primaryErrors: 4, primaryLatencySeconds: 5, unavailableReasons: [] },
      parameters: DEFAULT_PARAMETERS.strategy,
    });
    expect(result.automatic).toBe("serial");
    expect(result.features.adjacencyRatio).toBe(1);
  });

  it("classifies unsystematic search as random", () => {
    const events = [2, 11, 7, 16].map((hole, index) => visit(hole, index + 1));
    const samples: TrackingSample[] = [
      { timestampSeconds: 0, body: { x: 0, y: 0 }, confidence: 1, status: "tracked", source: "automatic" },
      { timestampSeconds: 4, body: { x: 10, y: 10 }, confidence: 1, status: "tracked", source: "automatic" },
    ];
    const result = computeStrategy({
      samples,
      events,
      arena,
      metrics: { primaryErrors: 4, primaryLatencySeconds: 8, unavailableReasons: [] },
      parameters: DEFAULT_PARAMETERS.strategy,
    });
    expect(result.automatic).toBe("random");
  });

  it("reports chronological transition counts when holes are revisited", () => {
    const events = [0, 1, 0, 1, 0].map((hole, index) => visit(hole + 1, index + 1));
    const samples: TrackingSample[] = events.map((event) => ({
      timestampSeconds: event.startSeconds,
      body: arena.holeCentersPx[event.holeIndex ?? 0],
      confidence: 1,
      status: "tracked" as const,
      source: "automatic" as const,
    }));
    const result = computeStrategy({
      samples,
      events,
      arena,
      metrics: { primaryErrors: 4, primaryLatencySeconds: 5, unavailableReasons: [] },
      parameters: DEFAULT_PARAMETERS.strategy,
    });
    expect(result.features.uniqueHolesInvestigated).toBe(2);
    expect(result.features.transitionCount).toBe(4);
    expect(result.features.adjacentTransitionCount).toBe(4);
    expect(result.features.adjacencyRatio).toBe(1);
    expect(result.reasoning.some((line) => line.startsWith("4 of 4 consecutive hole transitions"))).toBe(true);
    expect(result.reasoning.some((line) => line.startsWith("1 of 1"))).toBe(false);
  });

  it("preserves a manual override", () => {
    const samples: TrackingSample[] = [
      { timestampSeconds: 0, body: { x: 0, y: 0 }, confidence: 1, status: "tracked", source: "automatic" },
      { timestampSeconds: 1, body: arena.holeCentersPx[0], confidence: 1, status: "tracked", source: "automatic" },
    ];
    const result = computeStrategy({
      samples,
      events: [visit(0, 1)],
      arena,
      metrics: { primaryErrors: 0, primaryLatencySeconds: 1, unavailableReasons: [] },
      parameters: DEFAULT_PARAMETERS.strategy,
      override: "serial",
    });
    expect(result.automatic).toBe("spatial");
    expect(result.effective).toBe("serial");
    expect(result.overridden).toBe(true);
  });

  it("does not let post-target wandering turn a direct search into random", () => {
    const target = arena.holeCentersPx[0];
    const samples: TrackingSample[] = [
      { timestampSeconds: 0, body: { x: 0, y: 0 }, confidence: 1, status: "tracked", source: "automatic" },
      { timestampSeconds: 1, body: target, confidence: 1, status: "tracked", source: "automatic" },
      ...Array.from({ length: 40 }, (_, i) => ({
        timestampSeconds: 2 + i,
        body: { x: Math.sin(i) * 60, y: Math.cos(i * 1.7) * 60 },
        confidence: 1,
        status: "tracked" as const,
        source: "automatic" as const,
      })),
    ];
    const lateVisits = [7, 12, 3, 15].map((hole, index) => visit(hole, 10 + index));
    const result = computeStrategy({
      samples,
      events: [visit(0, 1), ...lateVisits],
      arena,
      metrics: { primaryErrors: 0, primaryLatencySeconds: 1, unavailableReasons: [] },
      parameters: DEFAULT_PARAMETERS.strategy,
    });
    expect(result.automatic).toBe("spatial");
    expect(result.features.uniqueHolesInvestigated).toBe(1);
    expect(result.reasoning.some((line) => line.includes("first valid target investigation"))).toBe(true);
  });

  it("classifies a serial sequence that reaches the target as serial", () => {
    const events = [16, 17, 18, 19, 0].map((hole, index) => visit(hole, index + 1));
    const samples: TrackingSample[] = events.map((event) => ({
      timestampSeconds: event.startSeconds,
      body: arena.holeCentersPx[event.holeIndex ?? 0],
      confidence: 1,
      status: "tracked" as const,
      source: "automatic" as const,
    }));
    const result = computeStrategy({
      samples,
      events,
      arena,
      metrics: { primaryErrors: 4, primaryLatencySeconds: 5, unavailableReasons: [] },
      parameters: DEFAULT_PARAMETERS.strategy,
    });
    expect(result.automatic).toBe("serial");
  });

  it("uses the full available trajectory when no target investigation occurs", () => {
    const events = [2, 11, 7, 16].map((hole, index) => visit(hole, index + 1));
    const samples: TrackingSample[] = [
      { timestampSeconds: 0, body: { x: 0, y: 0 }, confidence: 1, status: "tracked", source: "automatic" },
      { timestampSeconds: 8, body: { x: 40, y: -20 }, confidence: 1, status: "tracked", source: "automatic" },
    ];
    const result = computeStrategy({
      samples,
      events,
      arena,
      metrics: { primaryErrors: 4, primaryLatencySeconds: null, unavailableReasons: [] },
      parameters: DEFAULT_PARAMETERS.strategy,
    });
    expect(result.automatic).toBe("random");
    expect(result.features.uniqueHolesInvestigated).toBe(4);
    expect(result.reasoning.some((line) => line.includes("available trial trajectory"))).toBe(true);
  });
});
