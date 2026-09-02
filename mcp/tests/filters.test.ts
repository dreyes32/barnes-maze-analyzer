import { describe, expect, it } from "vitest";
import { AnalysisCatalog } from "../src/catalog";
import { metadataEquals, trialMatchesFilters } from "../src/queries/filters";
import { toListedTrial } from "../src/queries/trialSummary";
import { controlTreatmentSession } from "./fixtures";

const catalog = new AnalysisCatalog([
  {
    analysisId: controlTreatmentSession.id,
    fileName: "main.barnes.json",
    absolutePath: "/tmp/main.barnes.json",
    session: controlTreatmentSession,
  },
]);

describe("metadataEquals", () => {
  it("trims and ignores case without fuzzy cohort matching", () => {
    expect(metadataEquals("Control", "control")).toBe(true);
    expect(metadataEquals("B", "cohort B")).toBe(false);
    expect(metadataEquals(2, "2")).toBe(true);
    expect(metadataEquals(undefined, "2")).toBe(false);
  });
});

describe("list_trials filters", () => {
  it("returns all trials when unfiltered and includes analysisId", () => {
    const listed = catalog.listTrials();
    expect(Array.isArray(listed)).toBe(true);
    if (!Array.isArray(listed)) return;
    expect(listed).toHaveLength(5);
    expect(listed.every((item) => item.analysisId === "session-main")).toBe(true);
  });

  it("filters by cohort, animal, day, strategy, and needs-review", () => {
    const cohort = catalog.listTrials({ cohort: "control" });
    const animal = catalog.listTrials({ animalId: "M3" });
    const day = catalog.listTrials({ day: "2" });
    const strategy = catalog.listTrials({ strategy: "spatial" });
    const review = catalog.listTrials({ needsReview: true });
    const combined = catalog.listTrials({ cohort: "Control", day: "2", strategy: "spatial" });
    expect(Array.isArray(cohort) && cohort).toHaveLength(4);
    expect(Array.isArray(animal) && animal[0]?.trial.id).toBe("trial-t1");
    expect(Array.isArray(day) && day).toHaveLength(4);
    expect(Array.isArray(strategy) && strategy.map((item) => item.trial.id).sort()).toEqual([
      "trial-c1",
      "trial-c2",
    ]);
    expect(Array.isArray(review) && review.map((item) => item.trial.id)).toEqual(["trial-c2"]);
    expect(Array.isArray(combined) && combined.map((item) => item.trial.id).sort()).toEqual([
      "trial-c1",
      "trial-c2",
    ]);
  });

  it("preserves original metadata and nulls", () => {
    const listed = catalog.listTrials({ animalId: "M3" });
    expect(Array.isArray(listed)).toBe(true);
    if (!Array.isArray(listed)) return;
    expect(toListedTrial(listed[0]!).primaryLatencySeconds).toBeNull();
    expect(toListedTrial(listed[0]!).cohort).toBe("Treatment");
  });

  it("does not match a trial missing the filtered field", () => {
    const trial = controlTreatmentSession.trials[0]!;
    expect(trialMatchesFilters(trial, { animalId: "nope" })).toBe(false);
  });
});
