export const SCHEMA_VERSION = 1;
export const HOLE_COUNT = 20;
export const HOLE_ANGLE_STEP_RAD = (2 * Math.PI) / HOLE_COUNT;

export type Point = {
  x: number;
  y: number;
};

export type WorkflowStage = "videos" | "arena" | "track" | "review" | "results";

export type ReviewStatus =
  | "not-configured"
  | "arena-ready"
  | "tracking"
  | "needs-review"
  | "reviewed"
  | "complete";

export type Timebase = {
  timescale: number;
  frameDurationTimescaleUnits?: number;
  fps: number;
  isVariableFrameRate: boolean;
  source: "mp4-mdhd" | "mp4-stts" | "html-video" | "unknown";
};

export type VideoSourceMetadata = {
  fileName: string;
  fileSize: number;
  lastModified?: number;
  mimeType?: string;
  width: number;
  height: number;
  durationSeconds: number;
  frameCount?: number;
  fps?: number;
  timebase?: Timebase;
  sourceFingerprint: string;
};

export type ExperimentMetadata = {
  animalId?: string;
  cohort?: string;
  day?: string | number;
  trial?: string | number;
  notes?: string;
};

export type HoleGeometrySource = "predicted" | "refined" | "manual";

export type GeometrySource = "manual" | "assisted" | "reused" | "registered";

export type ArenaRegistration = {
  translationX: number;
  translationY: number;
  scale: number;
  rotationRadians: number;
  fromTrialId?: string;
};

export type ArenaGeometry = {
  platformCenterPx: Point;
  platformRadiusPx: number;
  holeCentersPx: Point[];
  holeRadiusPx: number;
  holeSources?: HoleGeometrySource[];
  targetHoleIndex: number;
  platformDiameterCm?: number;
  geometrySource: GeometrySource;
  registration?: ArenaRegistration;
};

export type TrackingStatus =
  | "tracked"
  | "low-confidence"
  | "failed"
  | "hidden"
  | "interpolated";

export type TrackingSource = "automatic" | "manual" | "interpolated";

export type TrackingDiagnostics = {
  candidateCount: number;
  selectedAreaPx: number;
  expectedAreaPx?: number;
  contrast: number;
  displacementPx?: number;
  ambiguity: number;
  nearBoundary: boolean;
  maskQuality: number;
};

export type TrackingSample = {
  timestampSeconds: number;
  frameIndex?: number;
  body?: Point;
  head?: Point;
  confidence: number;
  headConfidence?: number;
  status: TrackingStatus;
  source: TrackingSource;
  diagnostics?: TrackingDiagnostics;
};

export type TrackingResult = {
  rawSamples: TrackingSample[];
  effectiveSamples: TrackingSample[];
  analysisSamplingHz: number;
  startedAt: string;
  finishedAt: string;
  cancelled?: boolean;
};

export type CorrectionKind =
  | "body-position"
  | "head-position"
  | "tracking-failure"
  | "hidden-in-hole"
  | "event-add"
  | "event-remove"
  | "event-edit"
  | "strategy-override";

export type CorrectionRecord = {
  id: string;
  timestampSeconds: number;
  frameIndex?: number;
  kind: CorrectionKind;
  previousValue?: unknown;
  correctedValue?: unknown;
  createdAt: string;
};

export type BehavioralEventType =
  | "hole-investigation"
  | "target-investigation"
  | "escape-entry";

export type EventSource = "automatic" | "manual" | "automatic-confirmed";

export type BehavioralEvent = {
  id: string;
  type: BehavioralEventType;
  holeIndex?: number;
  startSeconds: number;
  endSeconds?: number;
  durationSeconds?: number;
  confidence: number;
  evidence: string[];
  source: EventSource;
};

export type TrialMetrics = {
  primaryLatencySeconds?: number | null;
  totalLatencySeconds?: number | null;
  primaryErrors?: number | null;
  totalErrors?: number | null;
  pathLengthCm?: number | null;
  pathLengthPx?: number | null;
  meanSpeedCmPerSec?: number | null;
  medianSpeedCmPerSec?: number | null;
  targetQuadrantTimeSeconds?: number | null;
  targetQuadrantPercent?: number | null;
  unavailableReasons: string[];
};

export type SearchStrategyLabel = "spatial" | "serial" | "random";

export type StrategyFeatures = {
  primaryErrors: number | null;
  primaryLatencySeconds: number | null;
  pathEfficiency: number | null;
  perimeterOccupancy: number | null;
  centerCrossings: number;
  uniqueHolesInvestigated: number;
  transitionCount: number;
  adjacentTransitionCount: number;
  adjacencyRatio: number | null;
  directionalConsistency: number | null;
};

export type SearchStrategyResult = {
  automatic: SearchStrategyLabel;
  effective: SearchStrategyLabel;
  overridden: boolean;
  features: StrategyFeatures;
  reasoning: string[];
};

export type SamplingParameters = {
  targetObservationsPerSecond: number;
};

export type TrackingParameters = {
  backgroundFrameCount: number;
  foregroundThreshold: "auto" | number;
  morphologyRadiusPx: number;
  platformMarginPx: number;
};

export type CleanupParameters = {
  gapFill: "none" | "short";
  maxGapSeconds: number;
  smoothing: "none" | "moving-median";
  smoothingWindow: number;
  outlierRule: "none" | "robust-speed";
  outlierMultiplier: number;
};

export type EventParameters = {
  investigationRadiusCm: number;
  fallbackInvestigationRadiusPx: number;
  minInvestigationSeconds: number;
  separationSeconds: number;
  hysteresisFactor: number;
  escapeDisappearanceSeconds: number;
  escapeProximityCm: number;
};

export type StrategyParameters = {
  spatialMaxPrimaryErrors: number;
  spatialMinPathEfficiency: number;
  serialMinAdjacencyRatio: number;
  serialMinInvestigations: number;
  serialMinPerimeterOccupancy: number;
};

export type AnalysisParameters = {
  sampling: SamplingParameters;
  tracking: TrackingParameters;
  cleanup: CleanupParameters;
  events: EventParameters;
  strategy: StrategyParameters;
};

export type QCSummary = {
  observationsAttempted: number;
  tracked: number;
  lowConfidence: number;
  failed: number;
  hidden: number;
  interpolated: number;
  manual: number;
  largestMissingIntervalSeconds: number;
  trackingCoveragePercent: number;
  warnings: string[];
};

export type ReviewIssueKind =
  | "low-confidence"
  | "large-jump"
  | "missing-interval"
  | "possible-escape"
  | "ambiguous-investigation"
  | "manual-correction";

export type ReviewIssue = {
  id: string;
  kind: ReviewIssueKind;
  startSeconds: number;
  endSeconds: number;
  summary: string;
  trialId: string;
};

export type TrialRecord = {
  id: string;
  source: VideoSourceMetadata;
  experimentMetadata: ExperimentMetadata;
  arena?: ArenaGeometry;
  tracking?: TrackingResult;
  corrections: CorrectionRecord[];
  events: BehavioralEvent[];
  metrics?: TrialMetrics;
  strategy?: SearchStrategyResult;
  qc?: QCSummary;
  reviewStatus: ReviewStatus;
  videoRelinkRequired?: boolean;
  groupId?: string;
};

export type TrialGroup = {
  id: string;
  name: string;
  collapsed?: boolean;
};

export type AnalysisSession = {
  id: string;
  name: string;
  schemaVersion: number;
  appVersion: string;
  createdAt: string;
  updatedAt: string;
  parameters: AnalysisParameters;
  trials: TrialRecord[];
  trialGroups?: TrialGroup[];
  currentStage: WorkflowStage;
  currentTrialId?: string;
  isDemo?: boolean;
  demoLabel?: string;
};

export type ParameterChangeImpact = {
  parameterPath: string;
  beforeLabel: string;
  afterLabel: string;
  eventCountBefore: number;
  eventCountAfter: number;
  primaryErrorsBefore: number | null;
  primaryErrorsAfter: number | null;
};
