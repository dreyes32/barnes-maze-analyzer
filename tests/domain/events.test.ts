import { describe, expect, it } from "vitest";
import { detectEvents, detectHoleInvestigations, inferEscapeEntry } from "../../src/domain/events";
import { DEFAULT_PARAMETERS } from "../../src/domain/defaults";
import { createAssistedArena } from "../../src/domain/geometry";
import type { TrackingSample } from "../../src/domain/types";

const arena = {
  ...createAssistedArena({
    platformCenterPx: { x: 100, y: 100 },
    platformEdgePx: { x: 200, y: 100 },
    firstHolePx: { x: 180, y: 100 },
    targetHoleIndex: 0,
  }),
  platformDiameterCm: 91,
};

function stay(holeIndex: number, start: number, n: number, dt = 0.1): TrackingSample[] {
  const hole = arena.holeCentersPx[holeIndex];
  return Array.from({ length: n }, (_, i) => ({
    timestampSeconds: start + i * dt,
    body: { ...hole },
    head: { ...hole },
    confidence: 0.8,
    headConfidence: 0.7,
    status: "tracked" as const,
    source: "automatic" as const,
  }));
}

describe("events", () => {
  it("counts a single false-hole investigation", () => {
    const samples = stay(3, 0, 6);
    const events = detectHoleInvestigations(samples, arena, DEFAULT_PARAMETERS.events);
    expect(events).toHaveLength(1);
    expect(events[0].holeIndex).toBe(3);
    expect(events[0].type).toBe("hole-investigation");
  });

  it("does not turn boundary jitter into dozens of visits", () => {
    const hole = arena.holeCentersPx[2];
    const samples: TrackingSample[] = Array.from({ length: 40 }, (_, i) => ({
      timestampSeconds: i * 0.05,
      body: { x: hole.x + (i % 2 === 0 ? 2 : 22), y: hole.y },
      confidence: 0.7,
      status: "tracked",
      source: "automatic",
    }));
    const events = detectHoleInvestigations(samples, arena, DEFAULT_PARAMETERS.events);
    expect(events.length).toBeLessThan(4);
  });

  it("counts separated visits separately", () => {
    const samples = [...stay(5, 0, 6), ...stay(5, 3, 6)];
    const events = detectHoleInvestigations(samples, arena, DEFAULT_PARAMETERS.events);
    expect(events).toHaveLength(2);
  });

  it("marks the first target investigation", () => {
    const samples = [...stay(3, 0, 6), ...stay(0, 2, 6)];
    const events = detectEvents(samples, arena, DEFAULT_PARAMETERS);
    expect(events.some((event) => event.type === "target-investigation" && event.holeIndex === 0)).toBe(true);
  });

  it("does not treat generic tracking loss as escape", () => {
    const samples: TrackingSample[] = [
      ...stay(8, 0, 5),
      { timestampSeconds: 1, status: "failed", source: "automatic", confidence: 0 },
      { timestampSeconds: 2.2, status: "failed", source: "automatic", confidence: 0 },
    ];
    const escape = inferEscapeEntry(samples, arena, DEFAULT_PARAMETERS.events, []);
    expect(escape).toBeNull();
  });

  it("does not convert a non-target disappearance into escape", () => {
    const samples: TrackingSample[] = [
      ...stay(6, 0, 5),
      { timestampSeconds: 1, status: "failed", source: "automatic", confidence: 0 },
      { timestampSeconds: 2.2, status: "failed", source: "automatic", confidence: 0 },
    ];
    const visits = detectHoleInvestigations(samples, arena, DEFAULT_PARAMETERS.events);
    const escape = inferEscapeEntry(samples, arena, DEFAULT_PARAMETERS.events, visits);
    expect(escape).toBeNull();
  });

  it("can infer escape after target contact plus disappearance", () => {
    const samples: TrackingSample[] = [
      ...stay(0, 0, 8),
      { timestampSeconds: 0.9, status: "failed", source: "automatic", confidence: 0 },
      { timestampSeconds: 2.0, status: "failed", source: "automatic", confidence: 0 },
    ];
    const visits = detectHoleInvestigations(samples, arena, DEFAULT_PARAMETERS.events);
    const escape = inferEscapeEntry(samples, arena, DEFAULT_PARAMETERS.events, visits);
    expect(escape?.type).toBe("escape-entry");
    expect(escape?.source).toBe("automatic");
    expect(escape && escape.confidence < 0.9).toBe(true);
  });

  it("keeps a manual event override", () => {
    const samples = stay(1, 0, 6);
    const events = detectEvents(samples, arena, DEFAULT_PARAMETERS, [
      {
        id: "c1",
        timestampSeconds: 0,
        kind: "event-add",
        createdAt: "2026-01-01T00:00:00.000Z",
        correctedValue: {
          id: "manual",
          type: "escape-entry",
          startSeconds: 4,
          confidence: 1,
          evidence: ["manual"],
          source: "manual",
        },
      },
    ]);
    expect(events.some((event) => event.type === "escape-entry" && event.source !== "automatic")).toBe(true);
  });
});
