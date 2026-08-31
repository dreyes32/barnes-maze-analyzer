import { z } from "zod";
import { SCHEMA_VERSION } from "./types";

export const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const timebaseSchema = z.object({
  timescale: z.number().positive(),
  frameDurationTimescaleUnits: z.number().positive().optional(),
  fps: z.number().positive(),
  isVariableFrameRate: z.boolean(),
  source: z.enum(["mp4-mdhd", "mp4-stts", "html-video", "unknown"]),
});

export const videoSourceSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().nonnegative(),
  lastModified: z.number().optional(),
  mimeType: z.string().optional(),
  width: z.number().positive(),
  height: z.number().positive(),
  durationSeconds: z.number().nonnegative(),
  frameCount: z.number().int().positive().optional(),
  fps: z.number().positive().optional(),
  timebase: timebaseSchema.optional(),
  sourceFingerprint: z.string().min(8),
});

export const experimentMetadataSchema = z.object({
  animalId: z.string().optional(),
  cohort: z.string().optional(),
  day: z.union([z.string(), z.number()]).optional(),
  trial: z.union([z.string(), z.number()]).optional(),
  notes: z.string().optional(),
});

export const arenaSchema = z.object({
  platformCenterPx: pointSchema,
  platformRadiusPx: z.number().positive(),
  holeCentersPx: z.array(pointSchema).length(20),
  holeRadiusPx: z.number().positive(),
  holeSources: z.array(z.enum(["predicted", "refined", "manual"])).optional(),
  targetHoleIndex: z.number().int().min(0).max(19),
  platformDiameterCm: z.number().positive().optional(),
  geometrySource: z.enum(["manual", "assisted", "reused", "registered"]),
  registration: z
    .object({
      translationX: z.number(),
      translationY: z.number(),
      scale: z.number().positive(),
      rotationRadians: z.number(),
      fromTrialId: z.string().optional(),
    })
    .optional(),
});

export const trackingSampleSchema = z.object({
  timestampSeconds: z.number().nonnegative(),
  frameIndex: z.number().int().nonnegative().optional(),
  body: pointSchema.optional(),
  head: pointSchema.optional(),
  confidence: z.number().min(0).max(1),
  headConfidence: z.number().min(0).max(1).optional(),
  status: z.enum(["tracked", "low-confidence", "failed", "hidden", "interpolated"]),
  source: z.enum(["automatic", "manual", "interpolated"]),
  diagnostics: z
    .object({
      candidateCount: z.number().int().nonnegative(),
      selectedAreaPx: z.number().nonnegative(),
      expectedAreaPx: z.number().nonnegative().optional(),
      contrast: z.number(),
      displacementPx: z.number().nonnegative().optional(),
      ambiguity: z.number().min(0).max(1),
      nearBoundary: z.boolean(),
      maskQuality: z.number().min(0).max(1),
    })
    .optional(),
});

export const trackingResultSchema = z.object({
  rawSamples: z.array(trackingSampleSchema),
  effectiveSamples: z.array(trackingSampleSchema),
  analysisSamplingHz: z.number().positive(),
  startedAt: z.string(),
  finishedAt: z.string(),
  cancelled: z.boolean().optional(),
});

export const correctionSchema = z.object({
  id: z.string(),
  timestampSeconds: z.number().nonnegative(),
  frameIndex: z.number().int().nonnegative().optional(),
  kind: z.enum([
    "body-position",
    "head-position",
    "tracking-failure",
    "hidden-in-hole",
    "event-add",
    "event-remove",
    "event-edit",
    "strategy-override",
  ]),
  previousValue: z.unknown().optional(),
  correctedValue: z.unknown().optional(),
  createdAt: z.string(),
});

export const eventSchema = z.object({
  id: z.string(),
  type: z.enum(["hole-investigation", "target-investigation", "escape-entry"]),
  holeIndex: z.number().int().min(0).max(19).optional(),
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().nonnegative().optional(),
  durationSeconds: z.number().nonnegative().optional(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
  source: z.enum(["automatic", "manual", "automatic-confirmed"]),
});

export const parametersSchema = z.object({
  sampling: z.object({
    targetObservationsPerSecond: z.number().positive(),
  }),
  tracking: z.object({
    backgroundFrameCount: z.number().int().positive(),
    foregroundThreshold: z.union([z.literal("auto"), z.number()]),
    morphologyRadiusPx: z.number().nonnegative(),
    platformMarginPx: z.number(),
  }),
  cleanup: z.object({
    gapFill: z.enum(["none", "short"]),
    maxGapSeconds: z.number().nonnegative(),
    smoothing: z.enum(["none", "moving-median"]),
    smoothingWindow: z.number().int().positive(),
    outlierRule: z.enum(["none", "robust-speed"]),
    outlierMultiplier: z.number().positive(),
  }),
  events: z.object({
    investigationRadiusCm: z.number().positive(),
    fallbackInvestigationRadiusPx: z.number().positive(),
    minInvestigationSeconds: z.number().nonnegative(),
    separationSeconds: z.number().nonnegative(),
    hysteresisFactor: z.number().positive(),
    escapeDisappearanceSeconds: z.number().positive(),
    escapeProximityCm: z.number().positive(),
  }),
  strategy: z.object({
    spatialMaxPrimaryErrors: z.number().nonnegative(),
    spatialMinPathEfficiency: z.number().min(0).max(1),
    serialMinAdjacencyRatio: z.number().min(0).max(1),
    serialMinInvestigations: z.number().int().nonnegative(),
    serialMinPerimeterOccupancy: z.number().min(0).max(1),
  }),
});

export const trialSchema = z.object({
  id: z.string(),
  source: videoSourceSchema,
  experimentMetadata: experimentMetadataSchema,
  arena: arenaSchema.optional(),
  tracking: trackingResultSchema.optional(),
  corrections: z.array(correctionSchema),
  events: z.array(eventSchema),
  metrics: z
    .object({
      primaryLatencySeconds: z.number().nullable().optional(),
      totalLatencySeconds: z.number().nullable().optional(),
      primaryErrors: z.number().nullable().optional(),
      totalErrors: z.number().nullable().optional(),
      pathLengthCm: z.number().nullable().optional(),
      pathLengthPx: z.number().nullable().optional(),
      meanSpeedCmPerSec: z.number().nullable().optional(),
      medianSpeedCmPerSec: z.number().nullable().optional(),
      targetQuadrantTimeSeconds: z.number().nullable().optional(),
      targetQuadrantPercent: z.number().nullable().optional(),
      unavailableReasons: z.array(z.string()),
    })
    .optional(),
  strategy: z
    .object({
      automatic: z.enum(["spatial", "serial", "random"]),
      effective: z.enum(["spatial", "serial", "random"]),
      overridden: z.boolean(),
      features: z.object({
        primaryErrors: z.number().nullable(),
        primaryLatencySeconds: z.number().nullable(),
        pathEfficiency: z.number().nullable(),
        perimeterOccupancy: z.number().nullable(),
        centerCrossings: z.number(),
        uniqueHolesInvestigated: z.number(),
        transitionCount: z.number().optional().default(0),
        adjacentTransitionCount: z.number().optional().default(0),
        adjacencyRatio: z.number().nullable(),
        directionalConsistency: z.number().nullable(),
      }),
      reasoning: z.array(z.string()),
    })
    .optional(),
  qc: z
    .object({
      observationsAttempted: z.number(),
      tracked: z.number(),
      lowConfidence: z.number(),
      failed: z.number(),
      hidden: z.number(),
      interpolated: z.number(),
      manual: z.number(),
      largestMissingIntervalSeconds: z.number(),
      trackingCoveragePercent: z.number(),
      warnings: z.array(z.string()),
    })
    .optional(),
  reviewStatus: z.enum([
    "not-configured",
    "arena-ready",
    "tracking",
    "needs-review",
    "reviewed",
    "complete",
  ]),
  videoRelinkRequired: z.boolean().optional(),
});

export const sessionSchema = z.object({
  id: z.string(),
  name: z.string(),
  schemaVersion: z.number().int().positive(),
  appVersion: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  parameters: parametersSchema,
  trials: z.array(trialSchema),
  currentStage: z.enum(["videos", "arena", "track", "review", "results"]),
  currentTrialId: z.string().optional(),
  isDemo: z.boolean().optional(),
  demoLabel: z.string().optional(),
});

export function parseSessionFile(data: unknown) {
  const parsed = sessionSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join(".") || "file";
    throw new Error(`This analysis file cannot be opened: ${path} — ${issue?.message ?? "invalid schema"}.`);
  }
  if (parsed.data.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `This analysis file uses schema ${parsed.data.schemaVersion}, which is newer than this application (schema ${SCHEMA_VERSION}).`,
    );
  }
  return parsed.data;
}
