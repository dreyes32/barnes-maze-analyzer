import type { SearchStrategyLabel } from "../../../src/domain/types";
import type { CatalogTrial } from "../catalog";
import { countStrategies, type StrategyCounts } from "./cohortSummary";
import { metadataString } from "./trialSummary";

export type StrategyOverrideRow = {
  analysisId: string;
  trialId: string;
  animalId: string | null;
  cohort: string | null;
  day: string | null;
  automaticStrategy: SearchStrategyLabel | null;
  finalStrategy: SearchStrategyLabel | null;
};

export type StrategyTrialRow = StrategyOverrideRow & {
  evidenceSummary: string;
};

export type StrategySummary = {
  filters: {
    analysisId: string | null;
    cohort: string | null;
    day: string | null;
    animalId: string | null;
  };
  totalTrials: number;
  automaticClassification: StrategyCounts;
  finalClassification: StrategyCounts;
  overrides: {
    overrideCount: number;
    trials: StrategyOverrideRow[];
  };
  trials: StrategyTrialRow[];
};

export function buildStrategySummary(
  trials: CatalogTrial[],
  filters: StrategySummary["filters"],
): StrategySummary {
  const rows: StrategyTrialRow[] = trials.map((item) => ({
    analysisId: item.analysisId,
    trialId: item.trial.id,
    animalId: metadataString(item.trial.experimentMetadata.animalId),
    cohort: metadataString(item.trial.experimentMetadata.cohort),
    day: metadataString(item.trial.experimentMetadata.day),
    automaticStrategy: item.trial.strategy?.automatic ?? null,
    finalStrategy: item.trial.strategy?.effective ?? null,
    evidenceSummary: item.trial.strategy?.reasoning.join(" ") ?? "",
  }));
  const overrides = rows.filter((_, index) => Boolean(trials[index]?.trial.strategy?.overridden));
  return {
    filters,
    totalTrials: trials.length,
    automaticClassification: countStrategies(trials, "automatic"),
    finalClassification: countStrategies(trials, "effective"),
    overrides: {
      overrideCount: overrides.length,
      trials: overrides.map(({ evidenceSummary: _evidence, ...row }) => row),
    },
    trials: rows,
  };
}
