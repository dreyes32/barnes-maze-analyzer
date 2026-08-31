import { describe, expect, it } from "vitest";
import { buildExampleSession } from "../../src/demo/buildExampleSession";
import { TRIAL_SUMMARY_COLUMNS, trialSummaryCsv, eventsCsv } from "../../src/export/csv";

describe("csv export", () => {
  it("includes the documented trial-summary columns and units in headings", () => {
    const csv = trialSummaryCsv(buildExampleSession());
    const header = csv.split("\n")[0];
    for (const column of TRIAL_SUMMARY_COLUMNS) {
      expect(header).toContain(column);
    }
    expect(header).toContain("primary_latency_s");
    expect(header).toContain("path_length_cm");
    expect(header).toContain("mean_speed_cm_s");
  });

  it("exports events with provenance and does not write misleading zeroes for missing animal IDs", () => {
    const session = buildExampleSession();
    const csv = eventsCsv(session);
    expect(csv.split("\n")[0]).toContain("source");
    expect(csv.split("\n")[0]).toContain("evidence");
    const summary = trialSummaryCsv(session);
    const firstRow = summary.split("\n")[1];
    expect(firstRow.startsWith(",")).toBe(true);
  });
});
