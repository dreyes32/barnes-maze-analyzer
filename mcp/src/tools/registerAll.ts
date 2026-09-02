import type { McpServer } from "@modelcontextprotocol/server";
import type { AnalysisCatalog } from "../catalog";
import type { McpRuntimeConfig } from "../config";
import { ConfigError, ensureExportDir } from "../config";
import { listAnalyses } from "../queries/listAnalyses";
import { buildCohortSummaries } from "../queries/cohortSummary";
import { buildReviewIssueRows } from "../queries/reviewSummary";
import { buildStrategySummary } from "../queries/strategySummary";
import { buildTrialSummary, toListedTrial } from "../queries/trialSummary";
import { sanitizeExportFileName, writeTrialSummaryCsv } from "../io/exportCsv";
import { toolError, toolOk } from "../result";
import {
  asMcpSchema,
  exportSummaryCsvInputSchema,
  getCohortSummaryInputSchema,
  getReviewIssuesInputSchema,
  getStrategySummaryInputSchema,
  getTrialSummaryInputSchema,
  listTrialsInputSchema,
} from "../schemas/tools";

export function registerAnalysisTools(
  server: McpServer,
  catalog: AnalysisCatalog,
  config: McpRuntimeConfig,
): void {
  server.registerTool(
    "list_analyses",
    {
      description:
        "List completed Barnes maze analyses loaded at server startup. " +
        "Use this to discover analysis IDs, cohort/animal/day labels, and trial counts. " +
        "This does not return trial metrics or tracking points.",
    },
    async () => {
      const analyses = listAnalyses(catalog);
      return toolOk(
        { analyses },
        analyses.length === 0
          ? "No analyses are loaded."
          : `${analyses.length} analysis file(s) available.`,
      );
    },
  );

  server.registerTool(
    "list_trials",
    {
      description:
        "Find trials in loaded .barnes.json analyses using optional metadata filters. " +
        "Use this for questions like which animals still need review, or which trials belong to a cohort or day. " +
        "strategy matches the researcher/final classification (effective), not the automatic label. " +
        "needsReview is true only when reviewStatus is needs-review. Missing metadata stays null.",
      inputSchema: asMcpSchema(listTrialsInputSchema),
    },
    async (args) => {
      const input = listTrialsInputSchema.parse(args);
      const result = catalog.listTrials(input);
      if (!Array.isArray(result)) return toolError(result.code, result.message);
      const trials = result.map(toListedTrial);
      return toolOk({ trials }, `${trials.length} trial(s) matched.`);
    },
  );

  server.registerTool(
    "get_trial_summary",
    {
      description:
        "Return a compact scientific summary for one completed trial: metadata, arena, metrics, " +
        "automatic vs final strategy, QC coverage, and analysis parameters used for interpretation. " +
        "Does not return tracking point arrays. Null metrics stay null and are never coerced to zero.",
      inputSchema: asMcpSchema(getTrialSummaryInputSchema),
    },
    async (args) => {
      const { trialId, analysisId } = getTrialSummaryInputSchema.parse(args);
      const found = catalog.findTrial(trialId, analysisId);
      if ("code" in found) return toolError(found.code, found.message);
      const summary = buildTrialSummary(found);
      return toolOk(
        summary,
        `${summary.metadata.sourceFile}: final strategy ${summary.strategy.final ?? "unavailable"}, ` +
          `review ${summary.qc.reviewStatus}.`,
      );
    },
  );

  server.registerTool(
    "get_cohort_summary",
    {
      description:
        "Return descriptive Barnes maze metrics aggregated from completed analysis files for one or more cohorts. " +
        "Use this for requests comparing latency, errors, path length, speed, target-quadrant occupancy, or strategy counts across cohorts. " +
        "Null scientific metrics are excluded from numeric aggregates and the valid count is returned. " +
        "This tool does not perform significance tests or infer treatment effects.",
      inputSchema: asMcpSchema(getCohortSummaryInputSchema),
    },
    async (args) => {
      const { cohort, analysisId, day } = getCohortSummaryInputSchema.parse(args);
      const result = catalog.listTrials({ analysisId, cohort, day });
      if (!Array.isArray(result)) return toolError(result.code, result.message);
      const cohorts = buildCohortSummaries(result, cohort);
      return toolOk({ cohorts }, `Descriptive summaries for ${cohorts.length} cohort group(s).`);
    },
  );

  server.registerTool(
    "get_strategy_summary",
    {
      description:
        "Summarize search-strategy classifications while keeping automatic labels distinct from " +
        "researcher/final (effective) labels. Use this for questions about spatial/serial/random " +
        "distributions or manual strategy overrides. This does not reclassify behavior.",
      inputSchema: asMcpSchema(getStrategySummaryInputSchema),
    },
    async (args) => {
      const { analysisId, cohort, day, animalId } = getStrategySummaryInputSchema.parse(args);
      const result = catalog.listTrials({ analysisId, cohort, day, animalId });
      if (!Array.isArray(result)) return toolError(result.code, result.message);
      const summary = buildStrategySummary(result, {
        analysisId: analysisId ?? null,
        cohort: cohort ?? null,
        day: day ?? null,
        animalId: animalId ?? null,
      });
      return toolOk(
        summary,
        `${summary.totalTrials} trial(s); ${summary.overrides.overrideCount} strategy override(s).`,
      );
    },
  );

  server.registerTool(
    "get_review_issues",
    {
      description:
        "List human-attention issues derived from existing QC/review semantics. " +
        "Use this for 'which trials still need review?' Individual issues have no resolved flag; " +
        "unresolvedOnly=true returns trials whose reviewStatus is needs-review. " +
        "Does not invent a resolved-issue model or dump tracking samples.",
      inputSchema: asMcpSchema(getReviewIssuesInputSchema),
    },
    async (args) => {
      const { analysisId, trialId, cohort, unresolvedOnly } = getReviewIssuesInputSchema.parse(args);
      const result = catalog.listTrials({ analysisId, cohort });
      if (!Array.isArray(result)) return toolError(result.code, result.message);
      const trials = buildReviewIssueRows(result, { trialId, unresolvedOnly });
      return toolOk({ trials }, `${trials.length} trial(s) with review information.`);
    },
  );

  server.registerTool(
    "export_summary_csv",
    {
      description:
        "Write a filtered trial-summary CSV using the same columns as the Barnes Maze Analyzer export. " +
        "This is the only write operation. The file is always created inside the configured export directory " +
        "(default ./mcp-exports). fileName must be a bare name, not a path. Null metrics stay empty.",
      inputSchema: asMcpSchema(exportSummaryCsvInputSchema),
    },
    async (args) => {
      const { analysisId, filters, fileName } = exportSummaryCsvInputSchema.parse(args);
      const result = catalog.listTrials({ analysisId, ...filters });
      if (!Array.isArray(result)) return toolError(result.code, result.message);
      try {
        const safeName = sanitizeExportFileName(fileName, filters);
        ensureExportDir(config.exportDir);
        const written = writeTrialSummaryCsv(result, config.exportDir, safeName);
        return toolOk(written, `Wrote ${written.rowCount} row(s) to ${written.fileName}.`);
      } catch (error) {
        if (error instanceof ConfigError) return toolError(error.code, error.message);
        return toolError("EXPORT_FAILED", "The CSV export could not be written.");
      }
    },
  );
}
