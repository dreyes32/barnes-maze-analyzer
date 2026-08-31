import { distance, isInTargetQuadrant, pixelsPerCm } from "./geometry";
import { elapsedSeconds } from "./timebase";
import type { ArenaGeometry, BehavioralEvent, TrackingSample, TrialMetrics } from "./types";

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function computeMetrics(options: {
  samples: TrackingSample[];
  events: BehavioralEvent[];
  arena?: ArenaGeometry;
  trialStartSeconds?: number;
}): TrialMetrics {
  const { samples, events, arena } = options;
  const trialStart = options.trialStartSeconds ?? samples[0]?.timestampSeconds ?? 0;
  const unavailableReasons: string[] = [];

  const targetInvestigations = events
    .filter((event) => event.type === "target-investigation")
    .sort((a, b) => a.startSeconds - b.startSeconds);
  const firstTarget = targetInvestigations[0];
  const escape = events
    .filter((event) => event.type === "escape-entry")
    .sort((a, b) => a.startSeconds - b.startSeconds)[0];

  const primaryLatencySeconds = firstTarget ? firstTarget.startSeconds - trialStart : null;
  if (!firstTarget) {
    unavailableReasons.push("Primary latency is missing because no target-hole investigation was detected.");
  }

  let totalLatencySeconds: number | null = null;
  if (!escape) {
    unavailableReasons.push("Total latency is unavailable until an escape entry is confirmed or inferred.");
  } else if (escape.confidence < 0.55 && escape.source === "automatic") {
    unavailableReasons.push(
      `Escape entry uncertain — review ${escape.startSeconds.toFixed(1)} s. Total latency is shown as inferred, not confirmed.`,
    );
    totalLatencySeconds = escape.startSeconds - trialStart;
  } else {
    totalLatencySeconds = escape.startSeconds - trialStart;
  }

  const investigations = events
    .filter((event) => event.type === "hole-investigation" || event.type === "target-investigation")
    .sort((a, b) => a.startSeconds - b.startSeconds);

  const primaryErrors = firstTarget
    ? investigations.filter(
        (event) =>
          event.startSeconds < firstTarget.startSeconds && event.holeIndex !== arena?.targetHoleIndex,
      ).length
    : investigations.filter((event) => event.holeIndex !== arena?.targetHoleIndex).length;

  const cutoff = escape?.startSeconds ?? samples.at(-1)?.timestampSeconds;
  const totalErrors = investigations.filter((event) => {
    if (arena && event.holeIndex === arena.targetHoleIndex) return false;
    if (cutoff !== undefined && event.startSeconds > cutoff) return false;
    return true;
  }).length;

  const scale = arena ? pixelsPerCm(arena) : null;
  if (!arena?.platformDiameterCm) {
    unavailableReasons.push("Unable to compute path length or speed in centimeters until platform diameter is provided.");
  }

  let pathLengthPx = 0;
  const speedsPx: number[] = [];
  let quadrantSeconds = 0;
  let validTrackedSeconds = 0;

  for (let i = 1; i < samples.length; i += 1) {
    const prev = samples[i - 1];
    const curr = samples[i];
    const dt = elapsedSeconds(prev.timestampSeconds, curr.timestampSeconds);
    if (dt <= 0) continue;

    const bothVisible = Boolean(prev.body && curr.body);
    const gapIsClean =
      bothVisible &&
      prev.status !== "failed" &&
      curr.status !== "failed" &&
      !(prev.status === "hidden" || curr.status === "hidden");

    if (gapIsClean && prev.body && curr.body) {
      const step = distance(prev.body, curr.body);
      pathLengthPx += step;
      speedsPx.push(step / dt);
      if (arena && isInTargetQuadrant(curr.body, arena)) {
        quadrantSeconds += dt;
      }
      validTrackedSeconds += dt;
    }
  }

  const pathLengthCm = scale ? pathLengthPx / scale : null;
  const meanSpeedCmPerSec =
    scale && validTrackedSeconds > 0 ? pathLengthPx / validTrackedSeconds / scale : null;
  const medianSpeedCmPerSec = scale && speedsPx.length > 0 ? (median(speedsPx) ?? 0) / scale : null;

  const targetQuadrantPercent =
    validTrackedSeconds > 0 ? (quadrantSeconds / validTrackedSeconds) * 100 : null;

  return {
    primaryLatencySeconds,
    totalLatencySeconds,
    primaryErrors: investigations.length ? primaryErrors : firstTarget ? 0 : null,
    totalErrors: investigations.length ? totalErrors : null,
    pathLengthCm,
    pathLengthPx,
    meanSpeedCmPerSec,
    medianSpeedCmPerSec,
    targetQuadrantTimeSeconds: validTrackedSeconds > 0 ? quadrantSeconds : null,
    targetQuadrantPercent,
    unavailableReasons,
  };
}
