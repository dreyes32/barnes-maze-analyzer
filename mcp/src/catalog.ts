import type { AnalysisSession, TrialRecord } from "../../src/domain/types";
import type { TrialQueryFilters } from "./queries/filters";
import { trialMatchesFilters } from "./queries/filters";
import type { LoadedAnalysisFile } from "./io/loadAnalysis";

export type CatalogEntry = {
  analysisId: string;
  fileName: string;
  session: AnalysisSession;
};

export type CatalogTrial = {
  analysisId: string;
  trial: TrialRecord;
  session: AnalysisSession;
};

export type CatalogError = {
  code: string;
  message: string;
};

export class AnalysisCatalog {
  readonly entries: CatalogEntry[];

  constructor(files: LoadedAnalysisFile[]) {
    this.entries = files.map((file) => ({
      analysisId: file.analysisId,
      fileName: file.fileName,
      session: file.session,
    }));
  }

  get(analysisId: string): CatalogEntry | undefined {
    return this.entries.find((entry) => entry.analysisId === analysisId);
  }

  requireAnalysis(analysisId: string | undefined): CatalogEntry[] | CatalogError {
    if (analysisId === undefined || analysisId.trim() === "") {
      return this.entries;
    }
    const found = this.get(analysisId.trim());
    if (!found) {
      return {
        code: "ANALYSIS_NOT_FOUND",
        message: `No analysis matched ${analysisId}. Use list_analyses for server-provided analysis IDs.`,
      };
    }
    return [found];
  }

  listTrials(filters: TrialQueryFilters = {}): CatalogTrial[] | CatalogError {
    const analyses = this.requireAnalysis(filters.analysisId);
    if (!Array.isArray(analyses)) return analyses;
    return analyses.flatMap((entry) =>
      entry.session.trials
        .filter((trial) => trialMatchesFilters(trial, filters))
        .map((trial) => ({ analysisId: entry.analysisId, trial, session: entry.session })),
    );
  }

  findTrial(trialId: string, analysisId?: string): CatalogTrial | CatalogError {
    const analyses = this.requireAnalysis(analysisId);
    if (!Array.isArray(analyses)) return analyses;
    const matches = analyses.flatMap((entry) =>
      entry.session.trials
        .filter((trial) => trial.id === trialId)
        .map((trial) => ({ analysisId: entry.analysisId, trial, session: entry.session })),
    );
    if (matches.length === 0) {
      return { code: "TRIAL_NOT_FOUND", message: `No trial matched ${trialId}.` };
    }
    if (matches.length > 1 && !analysisId) {
      return {
        code: "AMBIGUOUS_TRIAL",
        message: `Trial ${trialId} exists in multiple analyses. Supply analysisId.`,
      };
    }
    return matches[0]!;
  }
}
