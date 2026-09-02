import type { SearchStrategyLabel, TrialRecord } from "../../../src/domain/types";

export type TrialQueryFilters = {
  analysisId?: string;
  animalId?: string;
  cohort?: string;
  day?: string;
  strategy?: SearchStrategyLabel;
  needsReview?: boolean;
};

export function metadataEquals(
  actual: string | number | undefined,
  query: string | undefined,
): boolean {
  if (query === undefined) return true;
  if (actual === undefined) return false;
  return String(actual).trim().toLowerCase() === query.trim().toLowerCase();
}

export function normalizeFilter(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function trialMatchesFilters(trial: TrialRecord, filters: TrialQueryFilters): boolean {
  if (!metadataEquals(trial.experimentMetadata.animalId, normalizeFilter(filters.animalId))) {
    return false;
  }
  if (!metadataEquals(trial.experimentMetadata.cohort, normalizeFilter(filters.cohort))) {
    return false;
  }
  if (!metadataEquals(trial.experimentMetadata.day, normalizeFilter(filters.day))) {
    return false;
  }
  if (filters.strategy && trial.strategy?.effective !== filters.strategy) {
    return false;
  }
  if (filters.needsReview === true && trial.reviewStatus !== "needs-review") {
    return false;
  }
  if (filters.needsReview === false && trial.reviewStatus === "needs-review") {
    return false;
  }
  return true;
}

export function uniquePreservingOrder(values: Array<string | number | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (value === undefined) continue;
    const original = String(value);
    const key = original.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(original);
  }
  return out;
}
