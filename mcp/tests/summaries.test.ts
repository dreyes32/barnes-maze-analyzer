import { describe, expect, it } from "vitest";
import { AnalysisCatalog } from "../src/catalog";
import { buildCohortSummaries } from "../src/queries/cohortSummary";
import { buildReviewIssueRows } from "../src/queries/reviewSummary";
import { buildStrategySummary } from "../src/queries/strategySummary";
import { buildTrialSummary } from "../src/queries/trialSummary";
import { controlTreatmentSession, makeSession, makeTrial } from "./fixtures";

const catalog = new AnalysisCatalog([
  {
    analysisId: controlTreatmentSession.id,
    fileName: "main.barnes.json",
    absolutePath: "/tmp/main.barnes.json",
    session: controlTreatmentSession,
  },
]);

describe("trial summary", () => {
  it("returns metrics, nulls, strategy override, QC, and provenance", () => {
    const found = catalog.findTrial("trial-c2");
    expect("trial" in found).toBe(true);
    if (!("trial" in found)) return;
    const summary = buildTrialSummary(found);
    expect(summary.metrics.primaryLatencySeconds).toBe(20);
    expect(summary.strategy.automatic).toBe("serial");
    expect(summary.strategy.final).toBe("spatial");
    expect(summary.strategy.overridden).toBe(true);
    expect(summary.qc.lowConfidence).toBe(1);
    expect(summary.qc.automaticTrackingCoveragePercent).toBe(100);
    expect(summary.qc.effectiveTrajectoryCoveragePercent).toBe(100);
    expect(summary.provenance.appVersion).toBe("1.0.0");
    expect(summary.provenance.trackingStatus).toBe("ready");
    expect(summary.provenance.parameters.sampling.targetObservationsPerSecond).toBe(12);
    expect(summary.arena.targetHole).toBe(6);
    expect(summary.arena.physicallyCalibrated).toBe(true);
  });

  it("preserves null metrics", () => {
    const found = catalog.findTrial("trial-t1");
    expect("trial" in found).toBe(true);
    if (!("trial" in found)) return;
    const summary = buildTrialSummary(found);
    expect(summary.metrics.primaryLatencySeconds).toBeNull();
    expect(summary.metrics.pathLengthCm).toBeNull();
  });
});

describe("cohort aggregation", () => {
  it("ignores null latency when aggregating Control", () => {
    const trials = catalog.listTrials({ cohort: "Control" });
    expect(Array.isArray(trials)).toBe(true);
    if (!Array.isArray(trials)) return;
    const [summary] = buildCohortSummaries(trials, "Control");
    expect(summary?.metrics.primaryLatencySeconds).toEqual({
      count: 3,
      mean: 20,
      median: 20,
      min: 10,
      max: 30,
    });
    expect(summary?.animalCount).toBe(4);
    expect(summary?.review.trialsNeedingReview).toBe(1);
  });
});

describe("strategy summary", () => {
  it("keeps automatic and final classifications distinct", () => {
    const trials = catalog.listTrials({ cohort: "Control" });
    expect(Array.isArray(trials)).toBe(true);
    if (!Array.isArray(trials)) return;
    const summary = buildStrategySummary(trials, {
      analysisId: "session-main",
      cohort: "Control",
      day: null,
      animalId: null,
    });
    expect(summary.automaticClassification).toEqual({
      spatial: 1,
      serial: 1,
      random: 2,
      unavailable: 0,
    });
    expect(summary.finalClassification).toEqual({
      spatial: 2,
      serial: 0,
      random: 2,
      unavailable: 0,
    });
    expect(summary.overrides.overrideCount).toBe(1);
    expect(summary.overrides.trials[0]?.trialId).toBe("trial-c2");
  });
});

describe("review issues", () => {
  it("returns issues for a low-confidence trial and none for a clean complete trial", () => {
    const withIssues = catalog.findTrial("trial-c2");
    const clean = catalog.findTrial("trial-c1");
    expect("trial" in withIssues && "trial" in clean).toBe(true);
    if (!("trial" in withIssues) || !("trial" in clean)) return;
    const rows = buildReviewIssueRows([withIssues, clean], {});
    expect(rows.some((row) => row.trialId === "trial-c2" && row.issueCount > 0)).toBe(true);
    expect(rows.some((row) => row.trialId === "trial-c1")).toBe(false);
  });

  it("unresolvedOnly uses needs-review rather than inventing resolved issues", () => {
    const extra = makeSession({
      id: "other",
      name: "Other",
      trials: [makeTrial({ id: "done", fileName: "d.mp4", reviewStatus: "complete", lowConfidence: true })],
    });
    const extraCatalog = new AnalysisCatalog([
      {
        analysisId: extra.id,
        fileName: "other.barnes.json",
        absolutePath: "/tmp/other.barnes.json",
        session: extra,
      },
    ]);
    const listed = extraCatalog.listTrials();
    expect(Array.isArray(listed)).toBe(true);
    if (!Array.isArray(listed)) return;
    expect(buildReviewIssueRows(listed, { unresolvedOnly: true })).toEqual([]);
    expect(buildReviewIssueRows(listed, { unresolvedOnly: false })[0]?.issueCount).toBeGreaterThan(0);
  });
});
