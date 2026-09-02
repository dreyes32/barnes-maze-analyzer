import { writeFileSync } from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { TRIAL_SUMMARY_COLUMNS, toCsv, trialSummaryRow } from "../../../src/export/csv";
import type { CatalogTrial } from "../catalog";
import { ConfigError } from "../config";

const DEFAULT_EXPORT_NAME = "barnes-summary.csv";

export function sanitizeExportFileName(fileName: string | undefined, filters?: { cohort?: string; day?: string }): string {
  if (fileName === undefined || fileName.trim() === "") {
    const parts = ["barnes"];
    if (filters?.cohort) parts.push(filters.cohort);
    if (filters?.day) parts.push(`day-${filters.day}`);
    parts.push("summary");
    return `${slug(parts.join("-"))}.csv`;
  }

  const trimmed = fileName.trim();
  if (trimmed.includes("\0")) {
    throw new ConfigError("INVALID_FILENAME", "Null bytes are not allowed in fileName.");
  }
  if (isAbsolute(trimmed) || /^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith("\\\\")) {
    throw new ConfigError("INVALID_FILENAME", "Absolute output paths are not allowed. Provide a file name only.");
  }
  if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) {
    throw new ConfigError("INVALID_FILENAME", "fileName cannot contain path separators or '..'.");
  }
  const base = basename(trimmed);
  const safe = slug(base.replace(/\.csv$/i, ""));
  if (!safe) {
    throw new ConfigError("INVALID_FILENAME", "fileName must contain letters or numbers.");
  }
  return `${safe}.csv`;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function resolveExportPath(exportDir: string, fileName: string): string {
  const target = resolve(exportDir, fileName);
  const rel = relative(exportDir, target);
  if (rel.startsWith("..") || isAbsolute(rel) || rel.includes(`..${sep}`)) {
    throw new ConfigError("INVALID_FILENAME", "Export path escaped the configured export directory.");
  }
  return target;
}

export function writeTrialSummaryCsv(trials: CatalogTrial[], exportDir: string, fileName: string): {
  rowCount: number;
  fileName: string;
  outputPath: string;
  columns: string[];
} {
  const outputPath = resolveExportPath(exportDir, fileName);
  const columns = [...TRIAL_SUMMARY_COLUMNS];
  const csv = toCsv(
    columns,
    trials.map((item) => trialSummaryRow(item.trial)),
  );
  writeFileSync(outputPath, csv, "utf8");
  return {
    rowCount: trials.length,
    fileName,
    outputPath,
    columns,
  };
}

export { DEFAULT_EXPORT_NAME };
