import type { QCSummary, ReviewIssue, TrackingSample, TrialRecord } from "./types";

function missingIntervals(samples: TrackingSample[]): Array<{ start: number; end: number }> {
  const intervals: Array<{ start: number; end: number }> = [];
  let start: number | null = null;
  for (const sample of samples) {
    const missing = !sample.body && sample.status !== "hidden";
    if (missing && start === null) start = sample.timestampSeconds;
    if (!missing && start !== null) {
      intervals.push({ start, end: sample.timestampSeconds });
      start = null;
    }
  }
  if (start !== null && samples.length) {
    intervals.push({ start, end: samples[samples.length - 1].timestampSeconds });
  }
  return intervals;
}

function coveragePercent(samples: TrackingSample[], visible: (sample: TrackingSample) => boolean): number {
  if (samples.length === 0) return 0;
  return (samples.filter(visible).length / samples.length) * 100;
}

export function computeQc(samples: TrackingSample[], rawSamples?: TrackingSample[]): QCSummary {
  const observationsAttempted = samples.length;
  const tracked = samples.filter((sample) => sample.status === "tracked" && sample.source === "automatic").length;
  const lowConfidence = samples.filter((sample) => sample.status === "low-confidence").length;
  const failed = samples.filter((sample) => sample.status === "failed").length;
  const hidden = samples.filter((sample) => sample.status === "hidden").length;
  const interpolated = samples.filter((sample) => sample.source === "interpolated").length;
  const manual = samples.filter((sample) => sample.source === "manual").length;
  const intervals = missingIntervals(samples);
  const largestMissingIntervalSeconds = intervals.reduce(
    (max, interval) => Math.max(max, interval.end - interval.start),
    0,
  );
  const visible = samples.filter((sample) => Boolean(sample.body)).length;
  const effectiveTrajectoryCoveragePercent =
    observationsAttempted === 0 ? 0 : (visible / observationsAttempted) * 100;
  const trackingCoveragePercent = effectiveTrajectoryCoveragePercent;
  const automaticSource = rawSamples ?? samples.filter((sample) => sample.source === "automatic");
  const automaticTrackingCoveragePercent = coveragePercent(
    automaticSource,
    (sample) =>
      sample.source === "automatic" &&
      Boolean(sample.body) &&
      sample.status !== "failed" &&
      sample.status !== "hidden",
  );

  const warnings: string[] = [];
  if (largestMissingIntervalSeconds >= 0.8) {
    warnings.push(
      `Mouse is not detected for ${largestMissingIntervalSeconds.toFixed(1)} s in at least one interval. This may be hole entry or tracking loss — review that region.`,
    );
  }
  if (lowConfidence > observationsAttempted * 0.15) {
    warnings.push(
      `${lowConfidence} observations are low-confidence (${((lowConfidence / Math.max(observationsAttempted, 1)) * 100).toFixed(0)}% of the trial).`,
    );
  }
  if (interpolated > 0) {
    warnings.push(
      `${interpolated} observations were interpolated across short gaps. Long gaps were left missing.`,
    );
  }

  return {
    observationsAttempted,
    tracked,
    lowConfidence,
    failed,
    hidden,
    interpolated,
    manual,
    largestMissingIntervalSeconds,
    trackingCoveragePercent,
    automaticTrackingCoveragePercent,
    effectiveTrajectoryCoveragePercent,
    warnings,
  };
}

export function buildReviewIssues(trial: TrialRecord): ReviewIssue[] {
  const samples = trial.tracking?.effectiveSamples ?? [];
  const issues: ReviewIssue[] = [];

  const cluster = (
    kind: ReviewIssue["kind"],
    predicate: (sample: TrackingSample) => boolean,
    label: string,
  ) => {
    let start: number | null = null;
    let last = 0;
    for (const sample of samples) {
      if (predicate(sample)) {
        if (start === null) start = sample.timestampSeconds;
        last = sample.timestampSeconds;
      } else if (start !== null) {
        issues.push({
          id: `${trial.id}-${kind}-${start}`,
          kind,
          startSeconds: start,
          endSeconds: last,
          summary: `${label} from ${start.toFixed(1)}–${last.toFixed(1)} s.`,
          trialId: trial.id,
        });
        start = null;
      }
    }
    if (start !== null) {
      issues.push({
        id: `${trial.id}-${kind}-${start}`,
        kind,
        startSeconds: start,
        endSeconds: last,
        summary: `${label} from ${start.toFixed(1)}–${last.toFixed(1)} s.`,
        trialId: trial.id,
      });
    }
  };

  cluster("low-confidence", (sample) => sample.status === "low-confidence", "Low-confidence tracking");
  cluster(
    "missing-interval",
    (sample) => !sample.body && sample.status !== "hidden",
    "Missing tracking",
  );

  for (let i = 1; i < samples.length; i += 1) {
    const prev = samples[i - 1];
    const curr = samples[i];
    if (!prev.body || !curr.body) continue;
    const dt = curr.timestampSeconds - prev.timestampSeconds;
    if (dt <= 0) continue;
    const speed = Math.hypot(curr.body.x - prev.body.x, curr.body.y - prev.body.y) / dt;
    if (speed > 900) {
      issues.push({
        id: `${trial.id}-jump-${curr.timestampSeconds}`,
        kind: "large-jump",
        startSeconds: prev.timestampSeconds,
        endSeconds: curr.timestampSeconds,
        summary: `Large position jump at ${curr.timestampSeconds.toFixed(1)} s.`,
        trialId: trial.id,
      });
    }
  }

  for (const event of trial.events) {
    if (event.type === "escape-entry" && event.source === "automatic" && event.confidence < 0.7) {
      issues.push({
        id: `${trial.id}-escape-${event.id}`,
        kind: "possible-escape",
        startSeconds: event.startSeconds,
        endSeconds: event.endSeconds ?? event.startSeconds,
        summary: `Possible escape entry at ${event.startSeconds.toFixed(1)} s — confirm or reject.`,
        trialId: trial.id,
      });
    }
    if (event.type !== "escape-entry" && event.confidence < 0.5) {
      issues.push({
        id: `${trial.id}-ambig-${event.id}`,
        kind: "ambiguous-investigation",
        startSeconds: event.startSeconds,
        endSeconds: event.endSeconds ?? event.startSeconds,
        summary: `Ambiguous hole investigation at ${event.startSeconds.toFixed(1)} s (hole ${(event.holeIndex ?? 0) + 1}).`,
        trialId: trial.id,
      });
    }
  }

  for (const correction of trial.corrections.filter((item) =>
    ["body-position", "head-position", "hidden-in-hole", "tracking-failure"].includes(item.kind),
  )) {
    issues.push({
      id: `${trial.id}-manual-${correction.id}`,
      kind: "manual-correction",
      startSeconds: correction.timestampSeconds,
      endSeconds: correction.timestampSeconds,
      summary: `Manual correction at ${correction.timestampSeconds.toFixed(1)} s.`,
      trialId: trial.id,
    });
  }

  return issues.sort((a, b) => a.startSeconds - b.startSeconds);
}

export function qcWarningForTargetDisappearance(trial: TrialRecord): string | undefined {
  if (!trial.arena || !trial.tracking) return undefined;
  const target = trial.arena.holeCentersPx[trial.arena.targetHoleIndex];
  if (!target) return undefined;
  const samples = trial.tracking.effectiveSamples;
  for (let i = 1; i < samples.length; i += 1) {
    const prev = samples[i - 1];
    const curr = samples[i];
    if (prev.body && !curr.body) {
      const d = Math.hypot(prev.body.x - target.x, prev.body.y - target.y);
      if (d <= (trial.arena.holeRadiusPx + 16)) {
        return `Mouse is not detected immediately after contact with the target hole near ${curr.timestampSeconds.toFixed(1)} s; possible escape entry.`;
      }
    }
  }
  return undefined;
}
