import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS } from "../../src/domain/defaults";
import { detectEvents, detectHoleInvestigations, inferEscapeEntry } from "../../src/domain/events";
import { createAssistedArena } from "../../src/domain/geometry";
import { recomputeTrial } from "../../src/domain/pipeline";
import type { CorrectionRecord, TrackingSample, TrialRecord } from "../../src/domain/types";

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
    analysisSampleIndex: Math.round((start + i * dt) * 10),
    body: { ...hole },
    head: { ...hole },
    confidence: 0.8,
    headConfidence: 0.7,
    status: "tracked" as const,
    source: "automatic" as const,
  }));
}

function trialFromSamples(samples: TrackingSample[], corrections: CorrectionRecord[] = []): TrialRecord {
  return {
    id: "trial-event-ids",
    source: {
      fileName: "synthetic.mp4",
      fileSize: 10,
      width: 640,
      height: 480,
      durationSeconds: samples.at(-1)?.timestampSeconds ?? 1,
      fps: 30,
      sourceFingerprint: "test:event-ids",
    },
    experimentMetadata: {},
    arena,
    tracking: {
      rawSamples: samples,
      effectiveSamples: samples,
      analysisSamplingHz: 10,
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:00:00.000Z",
      status: "ready",
    },
    corrections,
    events: [],
    reviewStatus: "needs-review",
  };
}

function correction(partial: Omit<CorrectionRecord, "id" | "createdAt">): CorrectionRecord {
  return {
    id: "corr-1",
    createdAt: "2026-01-01T00:00:01.000Z",
    ...partial,
  };
}

describe("deterministic automatic event IDs", () => {
  it("assigns the same ID when detection is repeated on the same trajectory", () => {
    const samples = stay(3, 0, 6);
    const first = detectHoleInvestigations(samples, arena, DEFAULT_PARAMETERS.events);
    const second = detectHoleInvestigations(samples, arena, DEFAULT_PARAMETERS.events);
    expect(first).toHaveLength(1);
    expect(first[0].id).toBe(second[0].id);
    expect(first[0].id.startsWith("auto_hole-investigation_3_")).toBe(true);
  });

  it("keeps a rejected automatic investigation removed after recomputeTrial", () => {
    const samples = stay(3, 0, 6);
    const detected = recomputeTrial(trialFromSamples(samples), DEFAULT_PARAMETERS);
    const auto = detected.events.find((event) => event.type === "hole-investigation");
    expect(auto).toBeDefined();
    const rejected = recomputeTrial(
      trialFromSamples(samples, [
        correction({
          timestampSeconds: auto!.startSeconds,
          kind: "event-remove",
          previousValue: auto,
          correctedValue: { id: auto!.id },
        }),
      ]),
      DEFAULT_PARAMETERS,
    );
    expect(rejected.events.find((event) => event.id === auto!.id)).toBeUndefined();
    expect(rejected.events.filter((event) => event.type === "hole-investigation")).toHaveLength(0);
  });

  it("keeps an edited automatic investigation after recomputeTrial", () => {
    const samples = stay(3, 0, 6);
    const detected = recomputeTrial(trialFromSamples(samples), DEFAULT_PARAMETERS);
    const auto = detected.events.find((event) => event.type === "hole-investigation");
    expect(auto).toBeDefined();
    const edited = {
      ...auto!,
      holeIndex: 5,
      startSeconds: 0.2,
      endSeconds: 0.6,
      durationSeconds: 0.4,
      source: "automatic-confirmed" as const,
      evidence: [...auto!.evidence, "manually edited investigation"],
    };
    const after = recomputeTrial(
      trialFromSamples(samples, [
        correction({
          timestampSeconds: edited.startSeconds,
          kind: "event-edit",
          previousValue: auto,
          correctedValue: edited,
        }),
      ]),
      DEFAULT_PARAMETERS,
    );
    const effective = after.events.find((event) => event.id === auto!.id);
    expect(effective?.holeIndex).toBe(5);
    expect(effective?.startSeconds).toBe(0.2);
    expect(effective?.source).toBe("automatic-confirmed");
    expect(after.events.filter((event) => event.holeIndex === 3 && event.source === "automatic")).toHaveLength(0);
  });

  it("persists escape confirmation through recomputeTrial", () => {
    const samples: TrackingSample[] = [
      ...stay(0, 0, 8),
      { timestampSeconds: 0.9, status: "failed", source: "automatic", confidence: 0 },
      { timestampSeconds: 2.0, status: "failed", source: "automatic", confidence: 0 },
    ];
    const detected = recomputeTrial(trialFromSamples(samples), DEFAULT_PARAMETERS);
    const escape = detected.events.find((event) => event.type === "escape-entry");
    expect(escape).toBeDefined();
    const confirmed = recomputeTrial(
      trialFromSamples(samples, [
        correction({
          timestampSeconds: escape!.startSeconds,
          kind: "event-edit",
          previousValue: escape,
          correctedValue: { ...escape!, source: "automatic-confirmed", confidence: 1 },
        }),
      ]),
      DEFAULT_PARAMETERS,
    );
    const effective = confirmed.events.find((event) => event.type === "escape-entry");
    expect(effective?.id).toBe(escape!.id);
    expect(effective?.source).toBe("automatic-confirmed");
    expect(effective?.confidence).toBe(1);
  });

  it("keeps a rejected inferred escape from reappearing after recomputeTrial", () => {
    const samples: TrackingSample[] = [
      ...stay(0, 0, 8),
      { timestampSeconds: 0.9, status: "failed", source: "automatic", confidence: 0 },
      { timestampSeconds: 2.0, status: "failed", source: "automatic", confidence: 0 },
    ];
    const visits = detectHoleInvestigations(samples, arena, DEFAULT_PARAMETERS.events);
    const inferred = inferEscapeEntry(samples, arena, DEFAULT_PARAMETERS.events, visits);
    expect(inferred).not.toBeNull();
    const detected = recomputeTrial(trialFromSamples(samples), DEFAULT_PARAMETERS);
    const escape = detected.events.find((event) => event.type === "escape-entry");
    expect(escape?.id).toBe(inferred!.id);
    const rejected = recomputeTrial(
      trialFromSamples(samples, [
        correction({
          timestampSeconds: escape!.startSeconds,
          kind: "event-remove",
          previousValue: escape,
          correctedValue: { id: escape!.id },
        }),
      ]),
      DEFAULT_PARAMETERS,
    );
    expect(rejected.events.some((event) => event.type === "escape-entry")).toBe(false);
    const again = detectEvents(samples, arena, DEFAULT_PARAMETERS);
    expect(again.some((event) => event.id === escape!.id)).toBe(true);
  });
});
