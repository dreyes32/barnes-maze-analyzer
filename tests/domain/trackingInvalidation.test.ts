import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS, cloneParameters } from "../../src/domain/defaults";
import { createAssistedArena } from "../../src/domain/geometry";
import { recomputeTrial } from "../../src/domain/pipeline";
import {
  applyArenaToTrial,
  applyUpstreamParameterChange,
  buildTrackingProvenance,
  isTrackingStale,
} from "../../src/domain/trackingProvenance";
import type { TrackingSample, TrialRecord } from "../../src/domain/types";

const arena = createAssistedArena({
  platformCenterPx: { x: 100, y: 100 },
  platformEdgePx: { x: 200, y: 100 },
  firstHolePx: { x: 180, y: 100 },
  targetHoleIndex: 0,
});

const samples: TrackingSample[] = [
  {
    timestampSeconds: 0,
    analysisSampleIndex: 0,
    body: { x: 100, y: 100 },
    confidence: 0.9,
    status: "tracked",
    source: "automatic",
  },
];

function trial(): TrialRecord {
  const provenance = buildTrackingProvenance(DEFAULT_PARAMETERS, arena, "2026-01-01T00:00:00.000Z");
  return {
    id: "t1",
    source: {
      fileName: "clip.mp4",
      fileSize: 10,
      width: 640,
      height: 480,
      durationSeconds: 1,
      fps: 30,
      sourceFingerprint: "test:invalidation",
    },
    experimentMetadata: {},
    arena,
    tracking: {
      rawSamples: samples,
      effectiveSamples: samples,
      analysisSamplingHz: 12,
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:00:01.000Z",
      status: "ready",
      provenance,
    },
    corrections: [],
    events: [],
    reviewStatus: "needs-review",
  };
}

describe("tracking invalidation and provenance", () => {
  it("marks tracking stale when sampling rate changes and keeps provenance", () => {
    const before = cloneParameters(DEFAULT_PARAMETERS);
    const after = cloneParameters(DEFAULT_PARAMETERS);
    after.sampling.targetObservationsPerSecond = 20;
    const [next] = applyUpstreamParameterChange([trial()], before, after);
    expect(isTrackingStale(next.tracking)).toBe(true);
    expect(next.tracking?.rawSamples).toHaveLength(1);
    expect(next.tracking?.provenance?.sampling.targetObservationsPerSecond).toBe(12);
    expect(next.tracking?.provenance?.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("marks tracking stale when foreground threshold changes", () => {
    const before = cloneParameters(DEFAULT_PARAMETERS);
    const after = cloneParameters(DEFAULT_PARAMETERS);
    after.tracking.foregroundThreshold = 24;
    const [next] = applyUpstreamParameterChange([trial()], before, after);
    expect(isTrackingStale(next.tracking)).toBe(true);
  });

  it("marks tracking stale when platform geometry changes", () => {
    const next = applyArenaToTrial(trial(), {
      ...arena,
      platformCenterPx: { x: 110, y: 100 },
    });
    expect(isTrackingStale(next.tracking)).toBe(true);
    expect(next.tracking?.provenance?.arenaSnapshot.platformCenterPx).toEqual({ x: 100, y: 100 });
  });

  it("does not invalidate raw tracking when only the target hole changes", () => {
    const next = applyArenaToTrial(trial(), { ...arena, targetHoleIndex: 7 });
    expect(isTrackingStale(next.tracking)).toBe(false);
    expect(next.arena?.targetHoleIndex).toBe(7);
  });

  it("does not invalidate raw tracking when only platform diameter changes", () => {
    const next = applyArenaToTrial(trial(), { ...arena, platformDiameterCm: 91 });
    expect(isTrackingStale(next.tracking)).toBe(false);
  });

  it("recomputes events from existing samples when an event threshold changes", () => {
    const record = trial();
    const first = recomputeTrial(record, DEFAULT_PARAMETERS);
    const params = cloneParameters(DEFAULT_PARAMETERS);
    params.events.minInvestigationSeconds = 10;
    const afterParams = applyUpstreamParameterChange([first], DEFAULT_PARAMETERS, params);
    expect(isTrackingStale(afterParams[0].tracking)).toBe(false);
    const recomputed = recomputeTrial(afterParams[0], params);
    expect(recomputed.tracking?.provenance?.createdAt).toBe(first.tracking?.provenance?.createdAt);
    expect(recomputed.events.length).toBeLessThanOrEqual(first.events.length);
  });
});
