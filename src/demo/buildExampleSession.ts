import { DEFAULT_PARAMETERS, cloneParameters } from "../domain/defaults";
import { createAssistedArena } from "../domain/geometry";
import { createId, nowIso } from "../domain/ids";
import { recomputeTrial } from "../domain/pipeline";
import { SCHEMA_VERSION, type AnalysisSession, type Point, type TrackingSample, type TrialRecord } from "../domain/types";

function arenaFor(width = 640, height = 480) {
  const center = { x: width / 2, y: height / 2 };
  const edge = { x: center.x + 190, y: center.y };
  const hole = { x: center.x + 165, y: center.y };
  return {
    ...createAssistedArena({
      platformCenterPx: center,
      platformEdgePx: edge,
      firstHolePx: hole,
      targetHoleIndex: 4,
    }),
    platformDiameterCm: 91,
  };
}

function walk(points: Point[], start: number, dt: number, status: TrackingSample["status"][] = []): TrackingSample[] {
  return points.map((point, index) => ({
    timestampSeconds: start + index * dt,
    frameIndex: index,
    body: status[index] === "failed" || status[index] === "hidden" ? undefined : point,
    confidence: status[index] === "failed" ? 0 : 0.86,
    status: status[index] ?? "tracked",
    source: "automatic" as const,
  }));
}

function interpolate(a: Point, b: Point, n: number): Point[] {
  return Array.from({ length: n }, (_, i) => ({
    x: a.x + ((b.x - a.x) * i) / Math.max(n - 1, 1),
    y: a.y + ((b.y - a.y) * i) / Math.max(n - 1, 1),
  }));
}

function trialFromPath(
  fileName: string,
  fps: number,
  duration: number,
  path: Point[],
  missing: number[] = [],
): TrialRecord {
  const arena = arenaFor();
  const dt = 1 / 12;
  const statuses = path.map((_, index) => (missing.includes(index) ? "failed" : "tracked"));
  const rawSamples = walk(path, 0, dt, statuses as TrackingSample["status"][]);
  const source = {
    fileName,
    fileSize: 1000,
    width: 640,
    height: 480,
    durationSeconds: duration,
    fps,
    timebase: {
      timescale: Math.round(fps) === 15 || Math.abs(fps - 15000 / 1001) < 0.02 ? 15000 : 30000,
      frameDurationTimescaleUnits: Math.abs(fps - 15000 / 1001) < 0.02 ? 1001 : 1000,
      fps,
      isVariableFrameRate: false,
      source: "mp4-stts" as const,
    },
    sourceFingerprint: `demo:${fileName}:${fps}`,
  };
  const trial: TrialRecord = {
    id: createId("demo"),
    source,
    experimentMetadata: { notes: "Example analysis fixture. Not a newly executed run." },
    arena,
    tracking: {
      rawSamples,
      effectiveSamples: rawSamples,
      analysisSamplingHz: 12,
      startedAt: nowIso(),
      finishedAt: nowIso(),
    },
    corrections: [],
    events: [],
    reviewStatus: "needs-review",
  };
  return recomputeTrial(trial, DEFAULT_PARAMETERS);
}

export function buildExampleSession(): AnalysisSession {
  const arena = arenaFor();
  const target = arena.holeCentersPx[arena.targetHoleIndex];
  const center = arena.platformCenterPx;
  const serialPath = [
    ...interpolate(center, arena.holeCentersPx[0], 12),
    ...interpolate(arena.holeCentersPx[0], arena.holeCentersPx[1], 10),
    ...interpolate(arena.holeCentersPx[1], arena.holeCentersPx[2], 10),
    ...interpolate(arena.holeCentersPx[2], arena.holeCentersPx[3], 10),
    ...interpolate(arena.holeCentersPx[3], target, 10),
    ...interpolate(target, target, 8),
  ];
  const spatialPath = [...interpolate(center, target, 20), ...interpolate(target, target, 8)];
  const randomPath = [
    ...interpolate(center, { x: center.x - 40, y: center.y + 70 }, 10),
    ...interpolate({ x: center.x - 40, y: center.y + 70 }, arena.holeCentersPx[12], 10),
    ...interpolate(arena.holeCentersPx[12], arena.holeCentersPx[7], 12),
    ...interpolate(arena.holeCentersPx[7], { x: center.x + 20, y: center.y - 30 }, 10),
    ...interpolate({ x: center.x + 20, y: center.y - 30 }, target, 12),
  ];

  const trials = [
    trialFromPath("test50.mp4", 30, 184.6, serialPath, [serialPath.length - 3, serialPath.length - 2, serialPath.length - 1]),
    trialFromPath("test51.mp4", 15000 / 1001, 49.45, spatialPath, [spatialPath.length - 2, spatialPath.length - 1]),
    trialFromPath("test53.mp4", 30, 30.17, randomPath),
  ];

  const createdAt = nowIso();
  return {
    id: "demo-session",
    name: "Example Barnes maze session",
    schemaVersion: SCHEMA_VERSION,
    appVersion: "1.0.0",
    createdAt,
    updatedAt: createdAt,
    parameters: cloneParameters(DEFAULT_PARAMETERS),
    trials,
    currentStage: "results",
    currentTrialId: trials[0]?.id,
    isDemo: true,
    demoLabel: "Example analysis",
  };
}
