import { DEFAULT_PARAMETERS, cloneParameters } from "./defaults";
import { createId, nowIso } from "./ids";
import { SCHEMA_VERSION, type AnalysisSession, type ExperimentMetadata, type TrialRecord, type VideoSourceMetadata } from "./types";

export function createEmptySession(name = "Untitled session"): AnalysisSession {
  const createdAt = nowIso();
  return {
    id: createId("session"),
    name,
    schemaVersion: SCHEMA_VERSION,
    appVersion: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "1.0.0",
    createdAt,
    updatedAt: createdAt,
    parameters: cloneParameters(DEFAULT_PARAMETERS),
    trials: [],
    currentStage: "videos",
  };
}

export function createTrial(source: VideoSourceMetadata, metadata: ExperimentMetadata = {}): TrialRecord {
  return {
    id: createId("trial"),
    source,
    experimentMetadata: metadata,
    corrections: [],
    events: [],
    reviewStatus: "not-configured",
    videoRelinkRequired: false,
  };
}

export function trialDisplayName(trial: TrialRecord): string {
  const animal = trial.experimentMetadata.animalId;
  const trialNo = trial.experimentMetadata.trial;
  if (animal && trialNo !== undefined) return `${animal} · trial ${trialNo}`;
  if (animal) return animal;
  return trial.source.fileName;
}

export function reviewStatusLabel(status: TrialRecord["reviewStatus"]): string {
  switch (status) {
    case "not-configured":
      return "Not configured";
    case "arena-ready":
      return "Arena ready";
    case "tracking":
      return "Tracking";
    case "needs-review":
      return "Needs review";
    case "reviewed":
      return "Reviewed";
    case "complete":
      return "Complete";
    default:
      return status;
  }
}
