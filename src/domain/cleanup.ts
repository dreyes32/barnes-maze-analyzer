import { distance } from "./geometry";
import type { CleanupParameters, Point, TrackingSample } from "./types";

function cloneSample(sample: TrackingSample): TrackingSample {
  return {
    ...sample,
    body: sample.body ? { ...sample.body } : undefined,
    head: sample.head ? { ...sample.head } : undefined,
    diagnostics: sample.diagnostics ? { ...sample.diagnostics } : undefined,
  };
}

function isManual(sample: TrackingSample): boolean {
  return sample.source === "manual";
}

function hasBody(sample: TrackingSample): sample is TrackingSample & { body: Point } {
  return Boolean(sample.body);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function movingMedian(values: Array<number | undefined>, window: number): Array<number | undefined> {
  const radius = Math.max(0, Math.floor((window - 1) / 2));
  return values.map((_, index) => {
    if (values[index] === undefined) return undefined;
    const slice: number[] = [];
    for (let i = index - radius; i <= index + radius; i += 1) {
      const value = values[i];
      if (value !== undefined) slice.push(value);
    }
    return slice.length ? median(slice) : undefined;
  });
}

/**
 * Interpolate only short failed/missing gaps. Long gaps remain missing.
 * Manual points are never overwritten.
 */
export function fillShortGaps(samples: TrackingSample[], maxGapSeconds: number): TrackingSample[] {
  const result = samples.map(cloneSample);
  let i = 0;
  while (i < result.length) {
    const current = result[i];
    const missing =
      !isManual(current) &&
      (current.status === "failed" || (!current.body && current.status !== "hidden"));
    if (!missing) {
      i += 1;
      continue;
    }
    let end = i;
    while (
      end < result.length &&
      !isManual(result[end]) &&
      (result[end].status === "failed" || (!result[end].body && result[end].status !== "hidden"))
    ) {
      end += 1;
    }
    const before = result[i - 1];
    const after = result[end];
    if (
      before &&
      after &&
      hasBody(before) &&
      hasBody(after) &&
      after.timestampSeconds - before.timestampSeconds <= maxGapSeconds
    ) {
      const span = after.timestampSeconds - before.timestampSeconds;
      for (let j = i; j < end; j += 1) {
        if (isManual(result[j])) continue;
        const t = span === 0 ? 0 : (result[j].timestampSeconds - before.timestampSeconds) / span;
        result[j] = {
          ...result[j],
          body: {
            x: before.body.x + (after.body.x - before.body.x) * t,
            y: before.body.y + (after.body.y - before.body.y) * t,
          },
          status: "interpolated",
          source: "interpolated",
          confidence: Math.min(before.confidence, after.confidence) * 0.6,
        };
      }
    }
    i = end;
  }
  return result;
}

export function smoothTrajectory(samples: TrackingSample[], window: number): TrackingSample[] {
  const xs = samples.map((sample) => (isManual(sample) ? sample.body?.x : sample.body?.x));
  const ys = samples.map((sample) => sample.body?.y);
  const smoothX = movingMedian(xs, window);
  const smoothY = movingMedian(ys, window);
  return samples.map((sample, index) => {
    if (isManual(sample) || !sample.body || smoothX[index] === undefined || smoothY[index] === undefined) {
      return cloneSample(sample);
    }
    if (sample.status === "failed" || sample.status === "hidden") {
      return cloneSample(sample);
    }
    return {
      ...cloneSample(sample),
      body: { x: smoothX[index] as number, y: smoothY[index] as number },
    };
  });
}

export function rejectOutliers(samples: TrackingSample[], multiplier: number): {
  samples: TrackingSample[];
  affectedCount: number;
} {
  const speeds: number[] = [];
  for (let i = 1; i < samples.length; i += 1) {
    const prev = samples[i - 1];
    const curr = samples[i];
    if (!prev.body || !curr.body) continue;
    const dt = curr.timestampSeconds - prev.timestampSeconds;
    if (dt <= 0) continue;
    speeds.push(distance(prev.body, curr.body) / dt);
  }
  const center = median(speeds);
  const mad = median(speeds.map((speed) => Math.abs(speed - center))) || 1;
  const limit = center + multiplier * 1.4826 * mad;
  let affectedCount = 0;
  const result = samples.map(cloneSample);
  for (let i = 1; i < result.length; i += 1) {
    const prev = result[i - 1];
    const curr = result[i];
    if (isManual(curr) || !prev.body || !curr.body) continue;
    const dt = curr.timestampSeconds - prev.timestampSeconds;
    if (dt <= 0) continue;
    const speed = distance(prev.body, curr.body) / dt;
    if (speed > limit && curr.source === "automatic") {
      result[i] = {
        ...curr,
        body: undefined,
        head: undefined,
        status: "failed",
        confidence: Math.min(curr.confidence, 0.2),
        diagnostics: curr.diagnostics
          ? { ...curr.diagnostics, displacementPx: distance(prev.body, curr.body) }
          : undefined,
      };
      affectedCount += 1;
    }
  }
  return { samples: result, affectedCount };
}

export function applyCleanup(
  rawSamples: TrackingSample[],
  parameters: CleanupParameters,
): { samples: TrackingSample[]; outlierCount: number } {
  let samples = rawSamples.map(cloneSample);
  let outlierCount = 0;

  if (parameters.outlierRule === "robust-speed") {
    const rejected = rejectOutliers(samples, parameters.outlierMultiplier);
    samples = rejected.samples;
    outlierCount = rejected.affectedCount;
  }

  if (parameters.gapFill === "short") {
    samples = fillShortGaps(samples, parameters.maxGapSeconds);
  }

  if (parameters.smoothing === "moving-median") {
    samples = smoothTrajectory(samples, parameters.smoothingWindow);
  }

  return { samples, outlierCount };
}

export function applyManualCorrections(
  samples: TrackingSample[],
  corrections: Array<{
    timestampSeconds: number;
    kind: string;
    correctedValue?: unknown;
  }>,
): TrackingSample[] {
  if (corrections.length === 0) return samples.map(cloneSample);
  const result = samples.map(cloneSample);
  const nearestIndex = (timestamp: number): number => {
    let best = 0;
    let bestDelta = Number.POSITIVE_INFINITY;
    result.forEach((sample, index) => {
      const delta = Math.abs(sample.timestampSeconds - timestamp);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = index;
      }
    });
    return best;
  };

  const MATCH_SECONDS = 1e-4;
  const upsertIndex = (timestamp: number): number => {
    if (result.length === 0) {
      result.push({
        timestampSeconds: timestamp,
        confidence: 0,
        status: "failed",
        source: "manual",
      });
      return 0;
    }
    const nearest = nearestIndex(timestamp);
    if (Math.abs(result[nearest].timestampSeconds - timestamp) <= MATCH_SECONDS) {
      return nearest;
    }
    const insertAt = result.findIndex((sample) => sample.timestampSeconds > timestamp);
    const at = insertAt === -1 ? result.length : insertAt;
    result.splice(at, 0, {
      timestampSeconds: timestamp,
      confidence: 0,
      status: "failed",
      source: "manual",
    });
    return at;
  };

  for (const correction of corrections) {
    if (
      correction.kind !== "body-position" &&
      correction.kind !== "head-position" &&
      correction.kind !== "tracking-failure" &&
      correction.kind !== "hidden-in-hole"
    ) {
      continue;
    }
    const index = upsertIndex(correction.timestampSeconds);
    const current = result[index];
    if (correction.kind === "body-position") {
      const point = correction.correctedValue as Point;
      result[index] = {
        ...current,
        body: { ...point },
        status: "tracked",
        source: "manual",
        confidence: 1,
      };
    } else if (correction.kind === "head-position") {
      const point = correction.correctedValue as Point;
      result[index] = {
        ...current,
        head: { ...point },
        source: "manual",
        headConfidence: 1,
      };
    } else if (correction.kind === "tracking-failure") {
      result[index] = {
        ...current,
        body: undefined,
        head: undefined,
        status: "failed",
        source: "manual",
        confidence: 0,
      };
    } else if (correction.kind === "hidden-in-hole") {
      result[index] = {
        ...current,
        body: undefined,
        head: undefined,
        status: "hidden",
        source: "manual",
        confidence: 1,
      };
    }
  }
  return result;
}
