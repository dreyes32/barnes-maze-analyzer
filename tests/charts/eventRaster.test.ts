import { describe, expect, it } from "vitest";
import { timeTicks } from "../../src/components/charts/EventRaster";

describe("timeTicks", () => {
  it("does not add a colliding end label on a ~185 s trial", () => {
    expect(timeTicks(185)).toEqual([0, 60, 120, 180]);
  });

  it("keeps a regular-grid end tick when duration lands on the step", () => {
    expect(timeTicks(180)).toEqual([0, 30, 60, 90, 120, 150, 180]);
  });

  it("adds the trial end when it is far enough from the last grid tick", () => {
    expect(timeTicks(210)).toEqual([0, 60, 120, 180, 210]);
  });
});
