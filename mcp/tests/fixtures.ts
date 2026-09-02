import { writeFileSync } from "node:fs";
import { DEFAULT_PARAMETERS } from "../../src/domain/defaults";
import type {
  AnalysisSession,
  CorrectionRecord,
  SearchStrategyResult,
  TrialMetrics,
  TrialRecord,
  VideoSourceMetadata,
} from "../../src/domain/types";

export function source(fileName: string, durationSeconds = 60): VideoSourceMetadata {
  return {
    fileName,
    fileSize: 1000,
    width: 640,
    height: 480,
    durationSeconds,
    fps: 30,
    sourceFingerprint: `fixture:${fileName}`,
  };
}

function metrics(partial: Partial<TrialMetrics> = {}): TrialMetrics {
  return {
    primaryLatencySeconds: 10,
    totalLatencySeconds: 20,
    primaryErrors: 1,
    totalErrors: 2,
    pathLengthCm: 100,
    meanSpeedCmPerSec: 5,
    targetQuadrantTimeSeconds: 4,
    targetQuadrantPercent: 20,
    unavailableReasons: [],
    ...partial,
  };
}

function strategy(
  automatic: SearchStrategyResult["automatic"],
  effective = automatic,
  overridden = automatic !== effective,
): SearchStrategyResult {
  return {
    automatic,
    effective,
    overridden,
    features: {
      primaryErrors: 1,
      primaryLatencySeconds: 10,
      pathEfficiency: 0.5,
      perimeterOccupancy: 0.4,
      centerCrossings: 1,
      uniqueHolesInvestigated: 3,
      transitionCount: 4,
      adjacentTransitionCount: 2,
      adjacencyRatio: 0.5,
      directionalConsistency: 0.2,
    },
    reasoning: [`Automatic ${automatic}; final ${effective}.`],
  };
}

export function makeTrial(options: {
  id: string;
  fileName: string;
  animalId?: string;
  cohort?: string;
  day?: string | number;
  trial?: string | number;
  reviewStatus?: TrialRecord["reviewStatus"];
  metrics?: Partial<TrialMetrics> | null;
  automatic?: SearchStrategyResult["automatic"];
  final?: SearchStrategyResult["effective"];
  corrections?: CorrectionRecord[];
  lowConfidence?: boolean;
}): TrialRecord {
  const automatic = options.automatic ?? "random";
  const effective = options.final ?? automatic;
  const samples = [
    {
      timestampSeconds: 0,
      confidence: 0.9,
      status: "tracked" as const,
      source: "automatic" as const,
      body: { x: 1, y: 1 },
    },
    {
      timestampSeconds: 1,
      confidence: options.lowConfidence ? 0.2 : 0.9,
      status: (options.lowConfidence ? "low-confidence" : "tracked") as "low-confidence" | "tracked",
      source: "automatic" as const,
      body: { x: 2, y: 2 },
    },
  ];
  return {
    id: options.id,
    source: source(options.fileName),
    experimentMetadata: {
      animalId: options.animalId,
      cohort: options.cohort,
      day: options.day,
      trial: options.trial,
    },
    arena: {
      platformCenterPx: { x: 320, y: 240 },
      platformRadiusPx: 180,
      holeCentersPx: Array.from({ length: 20 }, (_, index) => ({ x: 320 + index, y: 240 })),
      holeRadiusPx: 8,
      targetHoleIndex: 5,
      platformDiameterCm: 91,
      geometrySource: "assisted",
    },
    tracking: {
      rawSamples: samples,
      effectiveSamples: samples,
      analysisSamplingHz: 12,
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:00:01.000Z",
      status: "ready",
    },
    corrections: options.corrections ?? [],
    events: [],
    metrics: options.metrics === null ? undefined : metrics(options.metrics),
    strategy: strategy(automatic, effective),
    qc: {
      observationsAttempted: 2,
      tracked: 2,
      lowConfidence: options.lowConfidence ? 1 : 0,
      failed: 0,
      hidden: 0,
      interpolated: 0,
      manual: 0,
      largestMissingIntervalSeconds: 0,
      trackingCoveragePercent: 100,
      automaticTrackingCoveragePercent: 100,
      effectiveTrajectoryCoveragePercent: 100,
      warnings: [],
    },
    reviewStatus: options.reviewStatus ?? "needs-review",
  };
}

export function makeSession(options: {
  id: string;
  name: string;
  trials: TrialRecord[];
}): AnalysisSession {
  return {
    id: options.id,
    name: options.name,
    schemaVersion: 1,
    appVersion: "1.0.0",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    parameters: structuredClone(DEFAULT_PARAMETERS),
    trials: options.trials,
    currentStage: "results",
  };
}

export const controlTreatmentSession = makeSession({
  id: "session-main",
  name: "Main experiment",
  trials: [
    makeTrial({
      id: "trial-c1",
      fileName: "c1.mp4",
      animalId: "M1",
      cohort: "Control",
      day: "2",
      trial: "1",
      automatic: "spatial",
      reviewStatus: "complete",
      metrics: { primaryLatencySeconds: 10, primaryErrors: 0, totalErrors: 1 },
    }),
    makeTrial({
      id: "trial-c2",
      fileName: "c2.mp4",
      animalId: "M2",
      cohort: "Control",
      day: "2",
      trial: "1",
      automatic: "serial",
      final: "spatial",
      reviewStatus: "needs-review",
      metrics: { primaryLatencySeconds: 20, primaryErrors: 2, totalErrors: 3 },
      lowConfidence: true,
    }),
    makeTrial({
      id: "trial-t1",
      fileName: "t1.mp4",
      animalId: "M3",
      cohort: "Treatment",
      day: "3",
      trial: "1",
      automatic: "random",
      reviewStatus: "reviewed",
      metrics: { primaryLatencySeconds: null, primaryErrors: 4, totalErrors: 4, pathLengthCm: null },
    }),
    makeTrial({
      id: "trial-null-lat",
      fileName: "c3.mp4",
      animalId: "M4",
      cohort: "Control",
      day: "2",
      trial: "2",
      automatic: "random",
      reviewStatus: "complete",
      metrics: { primaryLatencySeconds: null, primaryErrors: 1, totalErrors: 1 },
    }),
    makeTrial({
      id: "trial-c4",
      fileName: "c4.mp4",
      animalId: "M5",
      cohort: "Control",
      day: "2",
      trial: "3",
      automatic: "random",
      reviewStatus: "complete",
      metrics: { primaryLatencySeconds: 30, primaryErrors: 1, totalErrors: 1 },
    }),
  ],
});

export function writeSession(path: string, session: AnalysisSession): void {
  writeFileSync(path, `${JSON.stringify(session, null, 2)}\n`, "utf8");
}
