import type { AnalysisCatalog } from "../catalog";
import { uniquePreservingOrder } from "./filters";

export type AnalysisListItem = {
  analysisId: string;
  name: string;
  appVersion: string;
  createdAt: string;
  updatedAt: string;
  trialCount: number;
  cohorts: string[];
  animals: string[];
  days: string[];
};

export function listAnalyses(catalog: AnalysisCatalog): AnalysisListItem[] {
  return catalog.entries.map((entry) => {
    const trials = entry.session.trials;
    return {
      analysisId: entry.analysisId,
      name: entry.session.name,
      appVersion: entry.session.appVersion,
      createdAt: entry.session.createdAt,
      updatedAt: entry.session.updatedAt,
      trialCount: trials.length,
      cohorts: uniquePreservingOrder(trials.map((trial) => trial.experimentMetadata.cohort)),
      animals: uniquePreservingOrder(trials.map((trial) => trial.experimentMetadata.animalId)),
      days: uniquePreservingOrder(trials.map((trial) => trial.experimentMetadata.day)),
    };
  });
}
