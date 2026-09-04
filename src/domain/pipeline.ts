import { applyCleanup, applyManualCorrections } from "./cleanup";
import { detectEvents } from "./events";
import { computeMetrics, escapeConflictsWithTarget } from "./metrics";
import { computeQc, qcWarningForTargetDisappearance } from "./qc";
import { computeStrategy, strategyOverrideFromCorrections } from "./strategy";
import { isTrackingStale, migrateTrackingResult } from "./trackingProvenance";
import type {
  AnalysisParameters,
  AnalysisSession,
  ParameterChangeImpact,
  ReviewStatus,
  TrialRecord,
} from "./types";

export function deriveReviewStatus(trial: TrialRecord): ReviewStatus {
  if (!trial.arena) return "not-configured";
  if (trial.arena.targetHoleIndex < 0) return "not-configured";
  if (!trial.tracking || trial.tracking.rawSamples.length === 0) return "arena-ready";
  if (trial.tracking.cancelled) return "needs-review";
  const targetHoleIndex = trial.arena.targetHoleIndex;
  if (trial.events.some((event) => escapeConflictsWithTarget(event, targetHoleIndex))) {
    return "needs-review";
  }
  if (trial.reviewStatus === "complete") return "complete";
  if (trial.reviewStatus === "reviewed") return "reviewed";
  return "needs-review";
}

export function recomputeTrial(trial: TrialRecord, parameters: AnalysisParameters): TrialRecord {
  if (!trial.tracking) {
    return { ...trial, reviewStatus: deriveReviewStatus(trial) };
  }

  const tracking = migrateTrackingResult(trial.tracking);
  const afterManual = applyManualCorrections(tracking.rawSamples, trial.corrections);
  const cleaned = applyCleanup(afterManual, parameters.cleanup);
  const effectiveSamples = cleaned.samples;

  const events = trial.arena
    ? detectEvents(effectiveSamples, trial.arena, parameters, trial.corrections)
    : trial.events;

  const metrics = computeMetrics({
    samples: effectiveSamples,
    events,
    arena: trial.arena,
  });

  const strategy = trial.arena
    ? computeStrategy({
        samples: effectiveSamples,
        events,
        arena: trial.arena,
        metrics,
        parameters: parameters.strategy,
        override: strategyOverrideFromCorrections(trial.corrections),
      })
    : trial.strategy;

  const qc = computeQc(effectiveSamples, tracking.rawSamples);
  const extra = qcWarningForTargetDisappearance({ ...trial, events, tracking: { ...tracking, effectiveSamples } });
  if (extra && !qc.warnings.includes(extra)) qc.warnings.push(extra);
  for (const reason of metrics.unavailableReasons) {
    if (reason.includes("current target") && !qc.warnings.includes(reason)) {
      qc.warnings.push(reason);
    }
  }
  if (cleaned.outlierCount > 0) {
    qc.warnings.push(`${cleaned.outlierCount} observations exceed the movement outlier threshold.`);
  }
  if (isTrackingStale(tracking)) {
    const stale =
      "Tracking settings changed. Re-run tracking to apply them. Current results use the previous tracking run.";
    if (!qc.warnings.includes(stale)) qc.warnings.push(stale);
  }

  return {
    ...trial,
    tracking: {
      ...tracking,
      effectiveSamples,
    },
    events,
    metrics,
    strategy,
    qc,
    reviewStatus: deriveReviewStatus({
      ...trial,
      events,
      tracking: { ...tracking, effectiveSamples },
    }),
  };
}

export function recomputeSession(session: AnalysisSession): AnalysisSession {
  return {
    ...session,
    trials: session.trials.map((trial) => recomputeTrial(trial, session.parameters)),
    updatedAt: new Date().toISOString(),
  };
}

export function describeParameterImpact(
  before: AnalysisSession,
  after: AnalysisSession,
  parameterPath: string,
  beforeLabel: string,
  afterLabel: string,
  trialId?: string,
): ParameterChangeImpact {
  const id = trialId ?? after.currentTrialId ?? after.trials[0]?.id;
  const beforeTrial = before.trials.find((trial) => trial.id === id);
  const afterTrial = after.trials.find((trial) => trial.id === id);
  return {
    parameterPath,
    beforeLabel,
    afterLabel,
    eventCountBefore: beforeTrial?.events.length ?? 0,
    eventCountAfter: afterTrial?.events.length ?? 0,
    primaryErrorsBefore: beforeTrial?.metrics?.primaryErrors ?? null,
    primaryErrorsAfter: afterTrial?.metrics?.primaryErrors ?? null,
  };
}

export function formatParameterImpact(impact: ParameterChangeImpact): string {
  const errors =
    impact.primaryErrorsBefore !== null && impact.primaryErrorsAfter !== null
      ? ` and primary errors from ${impact.primaryErrorsBefore} → ${impact.primaryErrorsAfter}`
      : "";
  return `Changing ${impact.parameterPath} from ${impact.beforeLabel} → ${impact.afterLabel} reduces detected visits from ${impact.eventCountBefore} → ${impact.eventCountAfter}${errors}.`
    .replace("reduces detected visits", impact.eventCountAfter < impact.eventCountBefore ? "reduces detected visits" : impact.eventCountAfter > impact.eventCountBefore ? "increases detected visits" : "leaves detected visits")
    .replace("leaves detected visits from", "leaves detected visits at")
    .replace(/from (\d+) → \1/, "at $1");
}
