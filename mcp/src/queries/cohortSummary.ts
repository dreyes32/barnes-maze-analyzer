import type { CatalogTrial } from "../catalog";
import { describeNumbers, type NumericAggregate } from "./aggregates";
import { metadataString } from "./trialSummary";

export type StrategyCounts = {
  spatial: number;
  serial: number;
  random: number;
  unavailable: number;
};

export type CohortSummary = {
  cohort: string | null;
  trialCount: number;
  animalCount: number;
  metrics: {
    primaryLatencySeconds: NumericAggregate;
    totalLatencySeconds: NumericAggregate;
    primaryErrors: NumericAggregate;
    totalErrors: NumericAggregate;
    pathLengthCm: NumericAggregate;
    meanSpeedCmPerSec: NumericAggregate;
    targetQuadrantPercent: NumericAggregate;
  };
  strategies: StrategyCounts;
  review: {
    completeTrials: number;
    trialsNeedingReview: number;
  };
};

export function emptyStrategyCounts(): StrategyCounts {
  return { spatial: 0, serial: 0, random: 0, unavailable: 0 };
}

export function countStrategies(
  trials: CatalogTrial[],
  which: "automatic" | "effective",
): StrategyCounts {
  const counts = emptyStrategyCounts();
  for (const item of trials) {
    const label = item.trial.strategy?.[which];
    if (label === "spatial" || label === "serial" || label === "random") {
      counts[label] += 1;
    } else {
      counts.unavailable += 1;
    }
  }
  return counts;
}

function summarizeGroup(cohort: string | null, trials: CatalogTrial[]): CohortSummary {
  const animals = new Set<string>();
  for (const item of trials) {
    const animal = metadataString(item.trial.experimentMetadata.animalId);
    if (animal) animals.add(animal);
  }
  return {
    cohort,
    trialCount: trials.length,
    animalCount: animals.size,
    metrics: {
      primaryLatencySeconds: describeNumbers(trials.map((item) => item.trial.metrics?.primaryLatencySeconds)),
      totalLatencySeconds: describeNumbers(trials.map((item) => item.trial.metrics?.totalLatencySeconds)),
      primaryErrors: describeNumbers(trials.map((item) => item.trial.metrics?.primaryErrors)),
      totalErrors: describeNumbers(trials.map((item) => item.trial.metrics?.totalErrors)),
      pathLengthCm: describeNumbers(trials.map((item) => item.trial.metrics?.pathLengthCm)),
      meanSpeedCmPerSec: describeNumbers(trials.map((item) => item.trial.metrics?.meanSpeedCmPerSec)),
      targetQuadrantPercent: describeNumbers(trials.map((item) => item.trial.metrics?.targetQuadrantPercent)),
    },
    strategies: countStrategies(trials, "effective"),
    review: {
      completeTrials: trials.filter((item) => item.trial.reviewStatus === "complete").length,
      trialsNeedingReview: trials.filter((item) => item.trial.reviewStatus === "needs-review").length,
    },
  };
}

export function buildCohortSummaries(trials: CatalogTrial[], cohort?: string): CohortSummary[] {
  if (cohort !== undefined) {
    const stored = trials[0] ? metadataString(trials[0].trial.experimentMetadata.cohort) : null;
    return [summarizeGroup(stored, trials)];
  }
  const groups = new Map<string, { label: string | null; trials: CatalogTrial[] }>();
  for (const item of trials) {
    const label = metadataString(item.trial.experimentMetadata.cohort);
    const key = label === null ? "" : label.trim().toLowerCase();
    const existing = groups.get(key);
    if (existing) existing.trials.push(item);
    else groups.set(key, { label, trials: [item] });
  }
  return [...groups.values()].map((group) => summarizeGroup(group.label, group.trials));
}
