import type {
  AnalysisParameters,
  SearchStrategyLabel,
  StrategyFeatures,
  TrialRecord,
} from "../../../src/domain/types";
import type { CatalogTrial } from "../catalog";

const TRACKING_CORRECTION_KINDS = new Set([
  "body-position",
  "head-position",
  "hidden-in-hole",
  "tracking-failure",
]);

export function nullableNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && !Number.isNaN(value) ? value : null;
}

export function metadataString(value: string | number | undefined): string | null {
  return value === undefined ? null : String(value);
}

export function trackingCorrectionCount(trial: TrialRecord): number {
  return trial.corrections.filter((item) => TRACKING_CORRECTION_KINDS.has(item.kind)).length;
}

export type ListedTrial = {
  analysisId: string;
  trialId: string;
  sourceFile: string;
  animalId: string | null;
  cohort: string | null;
  day: string | null;
  trial: string | null;
  reviewStatus: TrialRecord["reviewStatus"];
  automaticStrategy: SearchStrategyLabel | null;
  finalStrategy: SearchStrategyLabel | null;
  primaryLatencySeconds: number | null;
  totalLatencySeconds: number | null;
  primaryErrors: number | null;
  totalErrors: number | null;
  automaticTrackingCoveragePercent: number | null;
  effectiveTrajectoryCoveragePercent: number | null;
};

export function toListedTrial(item: CatalogTrial): ListedTrial {
  const { trial, analysisId } = item;
  return {
    analysisId,
    trialId: trial.id,
    sourceFile: trial.source.fileName,
    animalId: metadataString(trial.experimentMetadata.animalId),
    cohort: metadataString(trial.experimentMetadata.cohort),
    day: metadataString(trial.experimentMetadata.day),
    trial: metadataString(trial.experimentMetadata.trial),
    reviewStatus: trial.reviewStatus,
    automaticStrategy: trial.strategy?.automatic ?? null,
    finalStrategy: trial.strategy?.effective ?? null,
    primaryLatencySeconds: nullableNumber(trial.metrics?.primaryLatencySeconds),
    totalLatencySeconds: nullableNumber(trial.metrics?.totalLatencySeconds),
    primaryErrors: nullableNumber(trial.metrics?.primaryErrors),
    totalErrors: nullableNumber(trial.metrics?.totalErrors),
    automaticTrackingCoveragePercent: nullableNumber(trial.qc?.automaticTrackingCoveragePercent),
    effectiveTrajectoryCoveragePercent: nullableNumber(
      trial.qc?.effectiveTrajectoryCoveragePercent ?? trial.qc?.trackingCoveragePercent,
    ),
  };
}

export type TrialSummary = {
  analysisId: string;
  trialId: string;
  metadata: {
    animalId: string | null;
    cohort: string | null;
    day: string | null;
    trial: string | null;
    sourceFile: string;
    durationSeconds: number;
  };
  arena: {
    targetHole: number | null;
    physicallyCalibrated: boolean;
    platformDiameterCm: number | null;
  };
  metrics: {
    primaryLatencySeconds: number | null;
    totalLatencySeconds: number | null;
    primaryErrors: number | null;
    totalErrors: number | null;
    pathLengthCm: number | null;
    meanSpeedCmPerSec: number | null;
    targetQuadrantTimeSeconds: number | null;
    targetQuadrantPercent: number | null;
    unavailableReasons: string[];
  };
  strategy: {
    automatic: SearchStrategyLabel | null;
    final: SearchStrategyLabel | null;
    overridden: boolean;
    evidence: string[];
    features: StrategyFeatures | null;
  };
  qc: {
    automaticTrackingCoveragePercent: number | null;
    effectiveTrajectoryCoveragePercent: number | null;
    lowConfidence: number | null;
    failed: number | null;
    interpolated: number | null;
    manualCorrectionCount: number;
    largestMissingIntervalSeconds: number | null;
    reviewStatus: TrialRecord["reviewStatus"];
  };
  provenance: {
    appVersion: string;
    trackingStatus: "ready" | "stale" | "missing";
    parameters: Pick<AnalysisParameters, "sampling" | "cleanup" | "events" | "strategy">;
  };
};

export function buildTrialSummary(item: CatalogTrial): TrialSummary {
  const { trial, session, analysisId } = item;
  const diameter = trial.arena?.platformDiameterCm;
  return {
    analysisId,
    trialId: trial.id,
    metadata: {
      animalId: metadataString(trial.experimentMetadata.animalId),
      cohort: metadataString(trial.experimentMetadata.cohort),
      day: metadataString(trial.experimentMetadata.day),
      trial: metadataString(trial.experimentMetadata.trial),
      sourceFile: trial.source.fileName,
      durationSeconds: trial.source.durationSeconds,
    },
    arena: {
      targetHole: trial.arena ? trial.arena.targetHoleIndex + 1 : null,
      physicallyCalibrated: typeof diameter === "number" && diameter > 0,
      platformDiameterCm: nullableNumber(diameter),
    },
    metrics: {
      primaryLatencySeconds: nullableNumber(trial.metrics?.primaryLatencySeconds),
      totalLatencySeconds: nullableNumber(trial.metrics?.totalLatencySeconds),
      primaryErrors: nullableNumber(trial.metrics?.primaryErrors),
      totalErrors: nullableNumber(trial.metrics?.totalErrors),
      pathLengthCm: nullableNumber(trial.metrics?.pathLengthCm),
      meanSpeedCmPerSec: nullableNumber(trial.metrics?.meanSpeedCmPerSec),
      targetQuadrantTimeSeconds: nullableNumber(trial.metrics?.targetQuadrantTimeSeconds),
      targetQuadrantPercent: nullableNumber(trial.metrics?.targetQuadrantPercent),
      unavailableReasons: trial.metrics?.unavailableReasons ?? [],
    },
    strategy: {
      automatic: trial.strategy?.automatic ?? null,
      final: trial.strategy?.effective ?? null,
      overridden: Boolean(trial.strategy?.overridden),
      evidence: trial.strategy?.reasoning ?? [],
      features: trial.strategy?.features ?? null,
    },
    qc: {
      automaticTrackingCoveragePercent: nullableNumber(trial.qc?.automaticTrackingCoveragePercent),
      effectiveTrajectoryCoveragePercent: nullableNumber(
        trial.qc?.effectiveTrajectoryCoveragePercent ?? trial.qc?.trackingCoveragePercent,
      ),
      lowConfidence: trial.qc ? trial.qc.lowConfidence : null,
      failed: trial.qc ? trial.qc.failed : null,
      interpolated: trial.qc ? trial.qc.interpolated : null,
      manualCorrectionCount: trackingCorrectionCount(trial),
      largestMissingIntervalSeconds: trial.qc ? trial.qc.largestMissingIntervalSeconds : null,
      reviewStatus: trial.reviewStatus,
    },
    provenance: {
      appVersion: session.appVersion,
      trackingStatus: trial.tracking?.status ?? (trial.tracking ? "ready" : "missing"),
      parameters: {
        sampling: session.parameters.sampling,
        cleanup: session.parameters.cleanup,
        events: session.parameters.events,
        strategy: session.parameters.strategy,
      },
    },
  };
}
