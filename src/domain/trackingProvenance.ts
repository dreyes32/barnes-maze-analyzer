import { nowIso } from "./ids";
import type {
  AnalysisParameters,
  ArenaGeometry,
  Point,
  TrackingParameters,
  TrackingProvenance,
  TrackingResult,
  TrackingSample,
  TrialRecord,
} from "./types";

const GEOMETRY_EPS = 0.05;

function pointsClose(a: Point, b: Point, eps = GEOMETRY_EPS): boolean {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
}

function holeRingsEqual(a: Point[], b: Point[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((point, index) => pointsClose(point, b[index]));
}

function fnv1a(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function trackingConfigHash(options: {
  sampling: { targetObservationsPerSecond: number };
  tracking: TrackingParameters;
  arena: Pick<ArenaGeometry, "platformCenterPx" | "platformRadiusPx" | "holeCentersPx" | "holeRadiusPx">;
}): string {
  const payload = JSON.stringify({
    sampling: options.sampling.targetObservationsPerSecond,
    tracking: options.tracking,
    center: [options.arena.platformCenterPx.x, options.arena.platformCenterPx.y],
    radius: options.arena.platformRadiusPx,
    holeRadius: options.arena.holeRadiusPx,
    holes: options.arena.holeCentersPx.map((hole) => [hole.x, hole.y]),
  });
  return fnv1a(payload);
}

export function buildTrackingProvenance(
  parameters: AnalysisParameters,
  arena: ArenaGeometry,
  createdAt = nowIso(),
): TrackingProvenance {
  const sampling = { targetObservationsPerSecond: parameters.sampling.targetObservationsPerSecond };
  const tracking = { ...parameters.tracking };
  const arenaSnapshot = {
    platformCenterPx: { ...arena.platformCenterPx },
    platformRadiusPx: arena.platformRadiusPx,
    holeCentersPx: arena.holeCentersPx.map((hole) => ({ ...hole })),
    holeRadiusPx: arena.holeRadiusPx,
  };
  return {
    sampling,
    tracking,
    arenaSnapshot,
    createdAt,
    configHash: trackingConfigHash({ sampling, tracking, arena }),
  };
}

export function isTrackingStale(tracking?: TrackingResult): boolean {
  return tracking?.status === "stale";
}

export function markTrackingStale(tracking: TrackingResult): TrackingResult {
  if (tracking.status === "stale") return tracking;
  return { ...tracking, status: "stale" };
}

export function upstreamTrackingParametersChanged(
  before: AnalysisParameters,
  after: AnalysisParameters,
): boolean {
  if (before.sampling.targetObservationsPerSecond !== after.sampling.targetObservationsPerSecond) {
    return true;
  }
  const keys: Array<keyof TrackingParameters> = [
    "backgroundFrameCount",
    "foregroundThreshold",
    "morphologyRadiusPx",
    "platformMarginPx",
  ];
  return keys.some((key) => before.tracking[key] !== after.tracking[key]);
}

/**
 * Platform mask, hole-sized blob penalty, and sitting-on-hole rejection all
 * use these geometry fields inside trackFrame(). Target hole and cm diameter
 * are downstream only.
 */
export function arenaRequiresRetracking(before: ArenaGeometry, after: ArenaGeometry): boolean {
  if (!pointsClose(before.platformCenterPx, after.platformCenterPx)) return true;
  if (Math.abs(before.platformRadiusPx - after.platformRadiusPx) > GEOMETRY_EPS) return true;
  if (Math.abs(before.holeRadiusPx - after.holeRadiusPx) > GEOMETRY_EPS) return true;
  if (!holeRingsEqual(before.holeCentersPx, after.holeCentersPx)) return true;
  return false;
}

export function applyUpstreamParameterChange(
  trials: TrialRecord[],
  before: AnalysisParameters,
  after: AnalysisParameters,
): TrialRecord[] {
  if (!upstreamTrackingParametersChanged(before, after)) return trials;
  return trials.map((trial) =>
    trial.tracking ? { ...trial, tracking: markTrackingStale(trial.tracking) } : trial,
  );
}

export function applyArenaToTrial(trial: TrialRecord, arena: ArenaGeometry): TrialRecord {
  const stale = trial.tracking && trial.arena ? arenaRequiresRetracking(trial.arena, arena) : false;
  return {
    ...trial,
    arena,
    tracking: stale && trial.tracking ? markTrackingStale(trial.tracking) : trial.tracking,
    reviewStatus: trial.tracking ? trial.reviewStatus : "arena-ready",
  };
}

export function analysisSampleIndexOf(sample: TrackingSample): number | undefined {
  return sample.analysisSampleIndex ?? sample.frameIndex;
}

export function sourceFrameIndexOf(sample: TrackingSample): number | undefined {
  return sample.sourceFrameIndex;
}

export function migrateSampleIndex(sample: TrackingSample): TrackingSample {
  if (sample.analysisSampleIndex !== undefined || sample.frameIndex === undefined) {
    return sample;
  }
  return { ...sample, analysisSampleIndex: sample.frameIndex };
}

export function migrateTrackingResult(tracking: TrackingResult): TrackingResult {
  return {
    ...tracking,
    rawSamples: tracking.rawSamples.map(migrateSampleIndex),
    effectiveSamples: tracking.effectiveSamples.map(migrateSampleIndex),
  };
}
