import type { Timebase } from "./types";

export const NTSC_NUMERATOR = 15000;
export const NTSC_DENOMINATOR = 1001;
export const NTSC_FPS = NTSC_NUMERATOR / NTSC_DENOMINATOR;

/**
 * Convert a frame index to seconds using the source timebase.
 * Never assume 30 fps. If the source is variable-frame-rate, prefer
 * presentation timestamps over this conversion.
 */
export function frameIndexToSeconds(frameIndex: number, timebase: Timebase): number {
  if (timebase.isVariableFrameRate) {
    throw new Error(
      "Frame-index conversion is approximate for variable-frame-rate video. Use presentation timestamps.",
    );
  }
  if (!Number.isFinite(timebase.fps) || timebase.fps <= 0) {
    throw new Error("Timebase fps must be a positive finite number.");
  }
  return frameIndex / timebase.fps;
}

export function secondsToFrameIndex(seconds: number, timebase: Timebase): number {
  if (!Number.isFinite(timebase.fps) || timebase.fps <= 0) {
    throw new Error("Timebase fps must be a positive finite number.");
  }
  return Math.round(seconds * timebase.fps);
}

export function rationalFps(numerator: number, denominator: number): number {
  if (denominator === 0) {
    throw new Error("FPS denominator cannot be zero.");
  }
  return numerator / denominator;
}

export function timebaseFromRational(options: {
  timescale: number;
  frameDurationTimescaleUnits?: number;
  fps?: number;
  isVariableFrameRate?: boolean;
  source?: Timebase["source"];
}): Timebase {
  const fps =
    options.fps ??
    (options.frameDurationTimescaleUnits
      ? options.timescale / options.frameDurationTimescaleUnits
      : undefined);
  if (fps === undefined) {
    throw new Error("Cannot construct a timebase without fps or frame duration.");
  }
  return {
    timescale: options.timescale,
    frameDurationTimescaleUnits: options.frameDurationTimescaleUnits,
    fps,
    isVariableFrameRate: options.isVariableFrameRate ?? false,
    source: options.source ?? "mp4-mdhd",
  };
}

/**
 * Guard used in tests and UI: treat "about 15 fps" as the NTSC family,
 * not as integer 15.
 */
export function isNtscFilmFamily(fps: number, tolerance = 0.02): boolean {
  return Math.abs(fps - NTSC_FPS) <= tolerance;
}

export function describeTimebase(timebase: Timebase): string {
  const fps = timebase.fps;
  if (isNtscFilmFamily(fps)) {
    return `${NTSC_NUMERATOR}/${NTSC_DENOMINATOR} ≈ ${fps.toFixed(3)} fps`;
  }
  if (Number.isInteger(fps)) {
    return `${fps} fps`;
  }
  return `${fps.toFixed(3)} fps`;
}

export function elapsedSeconds(previous: number, next: number): number {
  return Math.max(0, next - previous);
}

/** Nominal duration of one source frame from the parsed timebase. Never assumes 30 fps. */
export function nominalFrameDurationSeconds(timebase?: Timebase | null): number | undefined {
  if (!timebase) return undefined;
  if (timebase.frameDurationTimescaleUnits && timebase.timescale > 0) {
    return timebase.frameDurationTimescaleUnits / timebase.timescale;
  }
  if (Number.isFinite(timebase.fps) && timebase.fps > 0) {
    return 1 / timebase.fps;
  }
  return undefined;
}

/**
 * Source-frame step used by manual review. Prefers the MP4 timebase; otherwise
 * uses recorded fps or duration/frame-count. Does not invent 30 fps.
 */
export function sourceFrameDurationSeconds(source: {
  timebase?: Timebase;
  fps?: number;
  durationSeconds?: number;
  frameCount?: number;
}): number | undefined {
  const fromTimebase = nominalFrameDurationSeconds(source.timebase);
  if (fromTimebase) return fromTimebase;
  if (source.fps && source.fps > 0) return 1 / source.fps;
  if (source.durationSeconds && source.frameCount && source.frameCount > 1) {
    return source.durationSeconds / (source.frameCount - 1);
  }
  return undefined;
}

/**
 * Mean speed from irregular samples. Uses real timestamp deltas.
 * Pairs with a missing previous or next position are skipped.
 */
export function speedsFromSamples(
  samples: Array<{ timestampSeconds: number; x?: number; y?: number }>,
): number[] {
  const speeds: number[] = [];
  for (let i = 1; i < samples.length; i += 1) {
    const prev = samples[i - 1];
    const curr = samples[i];
    if (prev.x === undefined || prev.y === undefined || curr.x === undefined || curr.y === undefined) {
      continue;
    }
    const dt = elapsedSeconds(prev.timestampSeconds, curr.timestampSeconds);
    if (dt <= 0) continue;
    speeds.push(Math.hypot(curr.x - prev.x, curr.y - prev.y) / dt);
  }
  return speeds;
}
