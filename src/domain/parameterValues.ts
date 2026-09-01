import { z } from "zod";
import { parametersSchema } from "./schemas";

function refinePositiveMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid value.";
  if (issue.code === "too_small") {
    if (issue.type === "number" && Number(issue.minimum) === 0 && issue.inclusive === false) {
      return "Must be greater than 0.";
    }
    if (issue.type === "number" && Number(issue.minimum) === 0 && issue.inclusive === true) {
      return "Must be 0 or greater.";
    }
  }
  if (issue.code === "invalid_type") return "Enter a number.";
  return issue.message;
}

export function parseWithNumberSchema<T>(
  schema: z.ZodType<T>,
  raw: string,
): { ok: true; value: T } | { ok: false; message: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, message: "Enter a number." };
  if (trimmed === "auto") {
    const parsed = schema.safeParse("auto");
    if (parsed.success) return { ok: true, value: parsed.data };
    return { ok: false, message: refinePositiveMessage(parsed.error) };
  }
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return { ok: false, message: "Enter a number." };
  const parsed = schema.safeParse(numeric);
  if (!parsed.success) return { ok: false, message: refinePositiveMessage(parsed.error) };
  return { ok: true, value: parsed.data };
}

export const methodNumberSchemas = {
  targetObservationsPerSecond: parametersSchema.shape.sampling.shape.targetObservationsPerSecond,
  maxGapSeconds: parametersSchema.shape.cleanup.shape.maxGapSeconds,
  smoothingWindow: parametersSchema.shape.cleanup.shape.smoothingWindow,
  investigationRadiusCm: parametersSchema.shape.events.shape.investigationRadiusCm,
  minInvestigationSeconds: parametersSchema.shape.events.shape.minInvestigationSeconds,
  separationSeconds: parametersSchema.shape.events.shape.separationSeconds,
  hysteresisFactor: parametersSchema.shape.events.shape.hysteresisFactor,
  escapeDisappearanceSeconds: parametersSchema.shape.events.shape.escapeDisappearanceSeconds,
  outlierMultiplier: parametersSchema.shape.cleanup.shape.outlierMultiplier,
  spatialMaxPrimaryErrors: parametersSchema.shape.strategy.shape.spatialMaxPrimaryErrors,
  serialMinAdjacencyRatio: parametersSchema.shape.strategy.shape.serialMinAdjacencyRatio,
  foregroundThreshold: parametersSchema.shape.tracking.shape.foregroundThreshold,
};
