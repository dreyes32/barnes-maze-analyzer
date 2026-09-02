import { describe, expect, it } from "vitest";
import { describeNumbers } from "../src/queries/aggregates";

describe("describeNumbers", () => {
  it("excludes null and does not treat it as zero", () => {
    expect(describeNumbers([10, 20, null, 30])).toEqual({
      count: 3,
      mean: 20,
      median: 20,
      min: 10,
      max: 30,
    });
  });

  it("treats 0 as a valid value", () => {
    expect(describeNumbers([0, 2])).toEqual({
      count: 2,
      mean: 1,
      median: 1,
      min: 0,
      max: 2,
    });
  });

  it("excludes undefined and NaN", () => {
    expect(describeNumbers([5, undefined, Number.NaN])).toEqual({
      count: 1,
      mean: 5,
      median: 5,
      min: 5,
      max: 5,
    });
  });

  it("uses the midpoint for even-length medians", () => {
    expect(describeNumbers([1, 2, 3, 4]).median).toBe(2.5);
  });

  it("returns null aggregates when nothing is valid", () => {
    expect(describeNumbers([null, undefined, Number.NaN])).toEqual({
      count: 0,
      mean: null,
      median: null,
      min: null,
      max: null,
    });
  });
});
