import { describe, expect, it } from "vitest";
import {
  createAssistedArena,
  holesAreAdjacent,
  isInTargetQuadrant,
  pixelsPerCm,
  pxToCm,
  wrapHoleIndex,
} from "../../src/domain/geometry";

const arena = createAssistedArena({
  platformCenterPx: { x: 320, y: 240 },
  platformEdgePx: { x: 510, y: 240 },
  firstHolePx: { x: 485, y: 240 },
  targetHoleIndex: 0,
});

describe("geometry", () => {
  it("converts pixels to centimeters from the entered platform diameter", () => {
    const calibrated = { ...arena, platformDiameterCm: 91 };
    expect(pixelsPerCm(calibrated)).toBeCloseTo((190 * 2) / 91);
    expect(pxToCm(190 * 2, calibrated)).toBeCloseTo(91);
  });

  it("does not invent a centimeter scale without a diameter", () => {
    expect(pixelsPerCm(arena)).toBeNull();
    expect(pxToCm(100, arena)).toBeNull();
  });

  it("treats the target quadrant as a 90-degree sector around the target hole", () => {
    const target = arena.holeCentersPx[0];
    expect(isInTargetQuadrant(target, arena)).toBe(true);
    expect(isInTargetQuadrant(arena.platformCenterPx, arena)).toBe(true);
    const opposite = arena.holeCentersPx[10];
    expect(isInTargetQuadrant(opposite, arena)).toBe(false);
  });

  it("wraps hole indices so 20 and 1 are adjacent", () => {
    expect(wrapHoleIndex(20)).toBe(0);
    expect(wrapHoleIndex(-1)).toBe(19);
    expect(holesAreAdjacent(19, 0)).toBe(true);
    expect(holesAreAdjacent(0, 1)).toBe(true);
    expect(holesAreAdjacent(0, 10)).toBe(false);
  });

  it("generates 20 holes from one click", () => {
    expect(arena.holeCentersPx).toHaveLength(20);
  });
});
