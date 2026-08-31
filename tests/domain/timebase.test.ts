import { describe, expect, it } from "vitest";
import {
  NTSC_FPS,
  describeTimebase,
  frameIndexToSeconds,
  isNtscFilmFamily,
  rationalFps,
  speedsFromSamples,
  timebaseFromRational,
} from "../../src/domain/timebase";

describe("timebase", () => {
  it("uses 15000/1001 rather than integer 15 fps", () => {
    const fps = rationalFps(15000, 1001);
    expect(fps).toBeCloseTo(14.985014985, 8);
    expect(fps).not.toBe(15);
    expect(fps).not.toBe(30);
    expect(isNtscFilmFamily(fps)).toBe(true);
    const timebase = timebaseFromRational({
      timescale: 15000,
      frameDurationTimescaleUnits: 1001,
    });
    expect(timebase.fps).toBeCloseTo(NTSC_FPS);
    expect(frameIndexToSeconds(450, timebase)).toBeCloseTo(450 / (15000 / 1001));
    expect(frameIndexToSeconds(450, timebase)).not.toBeCloseTo(450 / 15, 6);
    expect(frameIndexToSeconds(450, timebase)).not.toBeCloseTo(450 / 30, 3);
    expect(describeTimebase(timebase)).toContain("15000/1001");
  });

  it("refuses hidden 30 fps conversion when given a real timebase", () => {
    const thirty = timebaseFromRational({ timescale: 30, fps: 30 });
    expect(frameIndexToSeconds(30, thirty)).toBe(1);
    const ntsc = timebaseFromRational({ timescale: 15000, frameDurationTimescaleUnits: 1001 });
    expect(frameIndexToSeconds(30, ntsc)).not.toBe(1);
  });

  it("computes speed from irregular timestamps", () => {
    const speeds = speedsFromSamples([
      { timestampSeconds: 0, x: 0, y: 0 },
      { timestampSeconds: 0.2, x: 10, y: 0 },
      { timestampSeconds: 0.5, x: 10, y: 15 },
    ]);
    expect(speeds[0]).toBeCloseTo(50);
    expect(speeds[1]).toBeCloseTo(50);
  });
});
