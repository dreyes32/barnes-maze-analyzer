import type { StandardSchemaWithJSON } from "@modelcontextprotocol/server";
import * as z from "zod";

/** MCP SDK 2.0 types require a JSON Schema vendor field newer than Zod 4.0.17. */
export function asMcpSchema<T>(schema: T): StandardSchemaWithJSON {
  return schema as unknown as StandardSchemaWithJSON;
}

export const strategyLabelSchema = z.enum(["spatial", "serial", "random"]);

export const listTrialsInputSchema = z.object({
  analysisId: z.string().optional(),
  animalId: z.string().optional(),
  cohort: z.string().optional(),
  day: z.string().optional(),
  strategy: strategyLabelSchema.optional(),
  needsReview: z.boolean().optional(),
});

export const getTrialSummaryInputSchema = z.object({
  trialId: z.string(),
  analysisId: z.string().optional(),
});

export const getCohortSummaryInputSchema = z.object({
  cohort: z.string().optional(),
  analysisId: z.string().optional(),
  day: z.string().optional(),
});

export const getStrategySummaryInputSchema = z.object({
  analysisId: z.string().optional(),
  cohort: z.string().optional(),
  day: z.string().optional(),
  animalId: z.string().optional(),
});

export const getReviewIssuesInputSchema = z.object({
  analysisId: z.string().optional(),
  trialId: z.string().optional(),
  cohort: z.string().optional(),
  unresolvedOnly: z.boolean().optional(),
});

export const exportSummaryCsvInputSchema = z.object({
  analysisId: z.string().optional(),
  filters: z
    .object({
      cohort: z.string().optional(),
      animalId: z.string().optional(),
      day: z.string().optional(),
      strategy: strategyLabelSchema.optional(),
      needsReview: z.boolean().optional(),
    })
    .optional(),
  fileName: z.string().optional(),
});

export const compareCohortsArgsSchema = z.object({
  cohortA: z.string().describe("First cohort label, for example Control"),
  cohortB: z.string().describe("Second cohort label, for example Treatment"),
  analysisId: z.string().optional().describe("Optional analysis ID from list_analyses"),
});

export const optionalAnalysisArgsSchema = z.object({
  analysisId: z.string().optional(),
});

export const cohortReportArgsSchema = z.object({
  cohort: z.string().describe("Cohort label as stored in the analysis"),
  analysisId: z.string().optional(),
});
