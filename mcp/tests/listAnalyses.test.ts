import { describe, expect, it } from "vitest";
import { AnalysisCatalog } from "../src/catalog";
import { listAnalyses } from "../src/queries/listAnalyses";
import { controlTreatmentSession, makeSession, makeTrial } from "./fixtures";

describe("listAnalyses", () => {
  it("returns session metadata without trial payloads", () => {
    const catalog = new AnalysisCatalog([
      {
        analysisId: controlTreatmentSession.id,
        fileName: "main.barnes.json",
        absolutePath: "/tmp/main.barnes.json",
        session: controlTreatmentSession,
      },
    ]);
    const [item] = listAnalyses(catalog);
    expect(item).toMatchObject({
      analysisId: "session-main",
      name: "Main experiment",
      appVersion: "1.0.0",
      trialCount: 5,
    });
    expect(item?.cohorts).toEqual(["Control", "Treatment"]);
    expect(item?.animals).toContain("M1");
    expect(item?.days).toEqual(["2", "3"]);
    expect(item).not.toHaveProperty("trials");
  });

  it("lists multiple analyses", () => {
    const second = makeSession({
      id: "session-b",
      name: "Cohort B only",
      trials: [makeTrial({ id: "b1", fileName: "b.mp4", cohort: "B", animalId: "B1", day: "1" })],
    });
    const catalog = new AnalysisCatalog([
      {
        analysisId: controlTreatmentSession.id,
        fileName: "main.barnes.json",
        absolutePath: "/tmp/main.barnes.json",
        session: controlTreatmentSession,
      },
      { analysisId: second.id, fileName: "b.barnes.json", absolutePath: "/tmp/b.barnes.json", session: second },
    ]);
    expect(listAnalyses(catalog).map((item) => item.analysisId)).toEqual(["session-main", "session-b"]);
  });
});
