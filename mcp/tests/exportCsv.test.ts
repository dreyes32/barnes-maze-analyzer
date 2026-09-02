import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TRIAL_SUMMARY_COLUMNS } from "../../src/export/csv";
import { AnalysisCatalog } from "../src/catalog";
import { ConfigError } from "../src/config";
import { sanitizeExportFileName, writeTrialSummaryCsv } from "../src/io/exportCsv";
import { controlTreatmentSession } from "./fixtures";

const catalog = new AnalysisCatalog([
  {
    analysisId: controlTreatmentSession.id,
    fileName: "main.barnes.json",
    absolutePath: "/tmp/main.barnes.json",
    session: controlTreatmentSession,
  },
]);

describe("CSV export", () => {
  it("writes the analyzer trial-summary columns and keeps nulls empty", () => {
    const dir = mkdtempSync(join(tmpdir(), "barnes-export-"));
    const trials = catalog.listTrials({ cohort: "Treatment" });
    expect(Array.isArray(trials)).toBe(true);
    if (!Array.isArray(trials)) return;
    const written = writeTrialSummaryCsv(trials, dir, "out.csv");
    expect(written.columns).toEqual([...TRIAL_SUMMARY_COLUMNS]);
    expect(written.rowCount).toBe(1);
    const text = readFileSync(written.outputPath, "utf8");
    const [header, row] = text.trim().split("\n");
    expect(header?.startsWith("animal_id,cohort")).toBe(true);
    expect(row).toContain("Treatment");
    const cells = row?.split(",") ?? [];
    const latencyIndex = TRIAL_SUMMARY_COLUMNS.indexOf("primary_latency_s");
    expect(cells[latencyIndex]).toBe("");
  });

  it("filters rows before writing", () => {
    const dir = mkdtempSync(join(tmpdir(), "barnes-export-"));
    const trials = catalog.listTrials({ day: "2" });
    expect(Array.isArray(trials) && trials).toHaveLength(4);
    if (!Array.isArray(trials)) return;
    const written = writeTrialSummaryCsv(trials, dir, "day2.csv");
    expect(written.rowCount).toBe(4);
  });

  it("rejects traversal, absolute paths, and keeps output inside the export root", () => {
    expect(() => sanitizeExportFileName("../../secret.csv")).toThrow(ConfigError);
    expect(() => sanitizeExportFileName("C:\\\\Windows\\\\out.csv")).toThrow(ConfigError);
    expect(() => sanitizeExportFileName("/tmp/out.csv")).toThrow(ConfigError);
    expect(sanitizeExportFileName("My File.csv")).toBe("my-file.csv");
    expect(sanitizeExportFileName(undefined, { cohort: "Control", day: "2" })).toBe(
      "barnes-control-day-2-summary.csv",
    );
  });
});
