import {
  absDiff,
  connectedComponents,
  coreCentroid,
  morphologicalClose,
  morphologicalOpen,
  otsuThreshold,
  platformMask,
  principalAxis,
  thresholdGray,
  type GrayImage,
} from "./image";
import { distance } from "./geometry";
import type { ArenaGeometry, Point, TrackingParameters, TrackingSample } from "./types";

export type TrackerMemory = {
  expectedAreaPx?: number;
  lastConfident?: { point: Point; timestampSeconds: number };
  lastMotion?: Point;
};

export type FrameTrackInput = {
  frame: GrayImage;
  background: GrayImage;
  arena: ArenaGeometry;
  parameters: TrackingParameters;
  timestampSeconds: number;
  /** Analysis sampling loop index. Prefer analysisSampleIndex. */
  frameIndex?: number;
  analysisSampleIndex?: number;
  sourceFrameIndex?: number;
  memory: TrackerMemory;
  scale?: number;
};

function analysisIndexFields(input: FrameTrackInput): Pick<
  TrackingSample,
  "analysisSampleIndex" | "sourceFrameIndex"
> {
  return {
    analysisSampleIndex: input.analysisSampleIndex ?? input.frameIndex,
    sourceFrameIndex: input.sourceFrameIndex,
  };
}

function toOriginal(point: Point, scale: number): Point {
  return { x: point.x / scale, y: point.y / scale };
}

function toWorking(point: Point, scale: number): Point {
  return { x: point.x * scale, y: point.y * scale };
}

export function trackFrame(input: FrameTrackInput): { sample: TrackingSample; memory: TrackerMemory } {
  const scale = input.scale ?? 1;
  const { frame, background, parameters } = input;
  const arena = input.arena;
  const center = toWorking(arena.platformCenterPx, scale);
  const radius = arena.platformRadiusPx * scale + parameters.platformMarginPx * scale;
  const mask = platformMask(frame.width, frame.height, center.x, center.y, radius);
  const diff = absDiff(frame, background);
  const threshold =
    parameters.foregroundThreshold === "auto"
      ? Math.max(12, otsuThreshold(diff, mask))
      : parameters.foregroundThreshold;
  const binary = thresholdGray(diff, threshold, mask);
  const opened = morphologicalOpen(
    binary,
    frame.width,
    frame.height,
    Math.max(1, Math.round(parameters.morphologyRadiusPx * scale)),
  );
  const closed = morphologicalClose(opened, frame.width, frame.height, 1);
  const components = connectedComponents(closed, frame.width, frame.height, diff.data);

  const expected = input.memory.expectedAreaPx;
  const last = input.memory.lastConfident;

  const scored = components.map((component) => {
    const body = coreCentroid(component, frame.width, frame.height);
    const areaScore =
      expected === undefined
        ? Math.min(1, component.area / 400)
        : Math.exp(-Math.abs(Math.log((component.area + 1) / (expected + 1))));
    const intensity = component.sumIntensity / Math.max(component.area, 1);
    const contrast = Math.min(1, intensity / 60);
    const displacement =
      last === undefined ? 0 : distance(body, toWorking(last.point, scale));
    const motionScore =
      last === undefined ? 0.7 : Math.exp(-displacement / Math.max(18, arena.platformRadiusPx * scale * 0.18));
    const bodyOrig = toOriginal(body, scale);
    const onHole = arena.holeCentersPx.some(
      (hole) => distance(bodyOrig, hole) <= arena.holeRadiusPx * 0.95,
    );
    const holeSized = expected === undefined ? component.area < 90 * scale * scale : component.area < expected * 0.4;
    const inside =
      distance(body, center) <= radius ? 1 : Math.max(0, 1 - (distance(body, center) - radius) / 20);
    const nearBoundary = distance(body, center) > radius * 0.82;
    const holePenalty = onHole && holeSized ? 0.12 : 1;
    return {
      component,
      body,
      areaScore,
      contrast,
      motionScore,
      inside,
      nearBoundary,
      displacement,
      score: (areaScore * 0.35 + contrast * 0.25 + motionScore * 0.25 + inside * 0.15) * holePenalty,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1];
  const ambiguity = best && second ? Math.max(0, Math.min(1, second.score / Math.max(best.score, 1e-6))) : 0;

  const memory: TrackerMemory = { ...input.memory };

  if (!best || best.score < 0.18 || best.component.area < 12) {
    return {
      memory,
      sample: {
        timestampSeconds: input.timestampSeconds,
        ...analysisIndexFields(input),
        confidence: 0,
        status: "failed",
        source: "automatic",
        diagnostics: {
          candidateCount: scored.length,
          selectedAreaPx: 0,
          expectedAreaPx: expected,
          contrast: 0,
          displacementPx: undefined,
          ambiguity,
          nearBoundary: false,
          maskQuality: threshold / 255,
        },
      },
    };
  }

  const body = toOriginal(best.body, scale);
  const sittingOnHole = arena.holeCentersPx.some(
    (hole) => distance(body, hole) <= arena.holeRadiusPx * 0.9,
  );
  const smallLikeHole = best.component.area < (expected ?? 220 * scale * scale) * 0.35;
  if (sittingOnHole && smallLikeHole) {
    return {
      memory,
      sample: {
        timestampSeconds: input.timestampSeconds,
        ...analysisIndexFields(input),
        confidence: 0.1,
        status: "failed",
        source: "automatic",
        diagnostics: {
          candidateCount: scored.length,
          selectedAreaPx: best.component.area / (scale * scale),
          expectedAreaPx: expected,
          contrast: best.contrast,
          displacementPx: last ? distance(body, last.point) : undefined,
          ambiguity,
          nearBoundary: best.nearBoundary,
          maskQuality: Math.min(1, threshold / 80),
        },
      },
    };
  }
  let confidence = Math.max(0.05, Math.min(0.98, best.score * (1 - 0.35 * ambiguity)));
  let status: TrackingSample["status"] = "tracked";
  if (confidence < 0.45 || ambiguity > 0.85 || best.nearBoundary) {
    status = "low-confidence";
    confidence = Math.min(confidence, 0.44);
  }

  if (best.score >= 0.4 && ambiguity < 0.7) {
    const prev = memory.expectedAreaPx;
    memory.expectedAreaPx = prev === undefined ? best.component.area : prev * 0.8 + best.component.area * 0.2;
    memory.lastConfident = { point: body, timestampSeconds: input.timestampSeconds };
  }

  let head: Point | undefined;
  let headConfidence = 0;
  if (best.component.area >= 20) {
    const axis = principalAxis(best.component);
    const motion = memory.lastMotion;
    const candidates = axis.endpoints;
    let chosen = candidates[0];
    if (motion) {
      const d0 =
        (candidates[0].x - best.body.x) * motion.x + (candidates[0].y - best.body.y) * motion.y;
      const d1 =
        (candidates[1].x - best.body.x) * motion.x + (candidates[1].y - best.body.y) * motion.y;
      chosen = d1 > d0 ? candidates[1] : candidates[0];
      headConfidence = Math.min(0.85, 0.35 + Math.abs(d1 - d0) / 40);
    } else {
      const d0 = distance(candidates[0], center);
      const d1 = distance(candidates[1], center);
      chosen = d1 > d0 ? candidates[1] : candidates[0];
      headConfidence = 0.28;
    }
    const elongation = Math.hypot(candidates[0].x - candidates[1].x, candidates[0].y - candidates[1].y);
    if (elongation < 10 || status === "low-confidence") {
      headConfidence = Math.min(headConfidence, 0.25);
    }
    if (headConfidence >= 0.35) {
      head = toOriginal(chosen, scale);
    }
  }

  if (last) {
    memory.lastMotion = { x: body.x - last.point.x, y: body.y - last.point.y };
  }

  return {
    memory,
    sample: {
      timestampSeconds: input.timestampSeconds,
      ...analysisIndexFields(input),
      body,
      head,
      confidence,
      headConfidence,
      status,
      source: "automatic",
      diagnostics: {
        candidateCount: scored.length,
        selectedAreaPx: best.component.area / (scale * scale),
        expectedAreaPx: expected,
        contrast: best.contrast,
        displacementPx: last ? distance(body, last.point) : undefined,
        ambiguity,
        nearBoundary: best.nearBoundary,
        maskQuality: Math.min(1, threshold / 80),
      },
    },
  };
}

export function estimateSamplingStride(sourceFps: number | undefined, targetHz: number): number {
  const fps = sourceFps && sourceFps > 0 ? sourceFps : targetHz;
  return Math.max(1, Math.round(fps / targetHz));
}
