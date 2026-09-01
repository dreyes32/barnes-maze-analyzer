import { HOLE_ANGLE_STEP_RAD, HOLE_COUNT, type ArenaGeometry, type Point } from "./types";

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function scalePoint(point: Point, factor: number): Point {
  return { x: point.x * factor, y: point.y * factor };
}

export function angleOf(point: Point, origin: Point): number {
  return Math.atan2(point.y - origin.y, point.x - origin.x);
}

export function normalizeAngle(radians: number): number {
  let value = radians;
  while (value <= -Math.PI) value += 2 * Math.PI;
  while (value > Math.PI) value -= 2 * Math.PI;
  return value;
}

export function circularMean(angles: number[]): number {
  if (angles.length === 0) return 0;
  const x = angles.reduce((sum, angle) => sum + Math.cos(angle), 0) / angles.length;
  const y = angles.reduce((sum, angle) => sum + Math.sin(angle), 0) / angles.length;
  return Math.atan2(y, x);
}

export function wrapHoleIndex(index: number, holeCount = HOLE_COUNT): number {
  return ((index % holeCount) + holeCount) % holeCount;
}

export function holeIndexDistance(a: number, b: number, holeCount = HOLE_COUNT): number {
  const raw = Math.abs(wrapHoleIndex(a, holeCount) - wrapHoleIndex(b, holeCount));
  return Math.min(raw, holeCount - raw);
}

export function holesAreAdjacent(a: number, b: number, holeCount = HOLE_COUNT): boolean {
  return holeIndexDistance(a, b, holeCount) === 1;
}

export function pixelsPerCm(arena: ArenaGeometry): number | null {
  if (arena.platformDiameterCm === undefined || arena.platformDiameterCm <= 0) {
    return null;
  }
  const diameterPx = arena.platformRadiusPx * 2;
  return diameterPx / arena.platformDiameterCm;
}

export function pxToCm(pixels: number, arena: ArenaGeometry): number | null {
  const scale = pixelsPerCm(arena);
  if (scale === null) return null;
  return pixels / scale;
}

export function cmToPx(cm: number, arena: ArenaGeometry): number | null {
  const scale = pixelsPerCm(arena);
  if (scale === null) return null;
  return cm * scale;
}

export function generateHoleRing(options: {
  center: Point;
  hole: Point;
  holeCount?: number;
}): Point[] {
  const holeCount = options.holeCount ?? HOLE_COUNT;
  const radius = distance(options.hole, options.center);
  const startAngle = angleOf(options.hole, options.center);
  const step = (2 * Math.PI) / holeCount;
  return Array.from({ length: holeCount }, (_, index) => {
    const angle = startAngle + index * step;
    return {
      x: options.center.x + radius * Math.cos(angle),
      y: options.center.y + radius * Math.sin(angle),
    };
  });
}

export function rotateHoles(arena: ArenaGeometry, deltaRadians: number): Point[] {
  return arena.holeCentersPx.map((hole) => {
    const radius = distance(hole, arena.platformCenterPx);
    const angle = angleOf(hole, arena.platformCenterPx) + deltaRadians;
    return {
      x: arena.platformCenterPx.x + radius * Math.cos(angle),
      y: arena.platformCenterPx.y + radius * Math.sin(angle),
    };
  });
}

export function scaleHoleRing(arena: ArenaGeometry, scale: number): Point[] {
  return arena.holeCentersPx.map((hole) => {
    const offset = subtract(hole, arena.platformCenterPx);
    return add(arena.platformCenterPx, scalePoint(offset, scale));
  });
}

export function transformArena(
  arena: ArenaGeometry,
  transform: { translationX: number; translationY: number; scale: number; rotationRadians: number },
): ArenaGeometry {
  const mapPoint = (point: Point): Point => {
    const shifted = subtract(point, arena.platformCenterPx);
    const rotated = {
      x:
        shifted.x * Math.cos(transform.rotationRadians) -
        shifted.y * Math.sin(transform.rotationRadians),
      y:
        shifted.x * Math.sin(transform.rotationRadians) +
        shifted.y * Math.cos(transform.rotationRadians),
    };
    return {
      x: arena.platformCenterPx.x + rotated.x * transform.scale + transform.translationX,
      y: arena.platformCenterPx.y + rotated.y * transform.scale + transform.translationY,
    };
  };

  return {
    ...arena,
    platformCenterPx: mapPoint(arena.platformCenterPx),
    platformRadiusPx: arena.platformRadiusPx * transform.scale,
    holeCentersPx: arena.holeCentersPx.map(mapPoint),
    holeRadiusPx: arena.holeRadiusPx * transform.scale,
    geometrySource: "registered",
    registration: {
      ...transform,
      fromTrialId: arena.registration?.fromTrialId,
    },
  };
}

/** Slide the platform circle without moving hole centers. */
export function nudgePlatformCenter(arena: ArenaGeometry, dx: number, dy: number): ArenaGeometry {
  return {
    ...arena,
    platformCenterPx: {
      x: arena.platformCenterPx.x + dx,
      y: arena.platformCenterPx.y + dy,
    },
    geometrySource: "manual",
  };
}

export function copyArena(arena: ArenaGeometry, geometrySource: ArenaGeometry["geometrySource"] = "reused"): ArenaGeometry {
  return {
    ...structuredClone(arena),
    geometrySource,
  };
}

export function targetHoleAngle(arena: ArenaGeometry): number {
  const target = arena.holeCentersPx[arena.targetHoleIndex];
  if (!target) return 0;
  return angleOf(target, arena.platformCenterPx);
}

/**
 * A 90-degree sector centered on the target-hole direction.
 * Angles use atan2 (x-axis = 0, counterclockwise).
 */
export function isInTargetQuadrant(point: Point, arena: ArenaGeometry): boolean {
  const targetAngle = targetHoleAngle(arena);
  const pointAngle = angleOf(point, arena.platformCenterPx);
  return Math.abs(normalizeAngle(pointAngle - targetAngle)) <= Math.PI / 4;
}

export function targetQuadrantWedges(arena: ArenaGeometry): { start: number; end: number } {
  const mid = targetHoleAngle(arena);
  return { start: mid - Math.PI / 4, end: mid + Math.PI / 4 };
}

export function nearestHoleIndex(point: Point, arena: ArenaGeometry): { index: number; distancePx: number } {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  arena.holeCentersPx.forEach((hole, index) => {
    const d = distance(point, hole);
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = index;
    }
  });
  return { index: bestIndex, distancePx: bestDistance };
}

export function investigationRadiusPx(arena: ArenaGeometry, fallbackPx: number, radiusCm: number): number {
  const calibrated = cmToPx(radiusCm, arena);
  return calibrated ?? fallbackPx;
}

export function assertHoleCount(points: Point[]): void {
  if (points.length !== HOLE_COUNT) {
    throw new Error(`Expected ${HOLE_COUNT} hole centers, received ${points.length}.`);
  }
}

export function createAssistedArena(options: {
  platformCenterPx: Point;
  platformEdgePx: Point;
  firstHolePx: Point;
  holeRadiusPx?: number;
  targetHoleIndex?: number;
}): ArenaGeometry {
  const platformRadiusPx = distance(options.platformCenterPx, options.platformEdgePx);
  const holeCentersPx = generateHoleRing({
    center: options.platformCenterPx,
    hole: options.firstHolePx,
  });
  return {
    platformCenterPx: options.platformCenterPx,
    platformRadiusPx,
    holeCentersPx,
    holeRadiusPx: options.holeRadiusPx ?? Math.max(6, platformRadiusPx * 0.045),
    holeSources: Array.from({ length: HOLE_COUNT }, (_, index) => (index === 0 ? "manual" : "predicted")),
    targetHoleIndex: options.targetHoleIndex ?? 0,
    geometrySource: "assisted",
  };
}

export { HOLE_ANGLE_STEP_RAD };
