import { distance, holesAreAdjacent, isInTargetQuadrant } from "./geometry";
import type {
  ArenaGeometry,
  BehavioralEvent,
  SearchStrategyLabel,
  SearchStrategyResult,
  StrategyFeatures,
  StrategyParameters,
  TrackingSample,
  TrialMetrics,
} from "./types";

function pathEfficiency(samples: TrackingSample[], arena: ArenaGeometry): number | null {
  const first = samples.find((sample) => sample.body);
  const lastVisible = [...samples].reverse().find((sample) => sample.body);
  if (!first?.body || !lastVisible?.body) return null;
  const target = arena.holeCentersPx[arena.targetHoleIndex];
  if (!target) return null;
  let path = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const prev = samples[i - 1].body;
    const curr = samples[i].body;
    if (prev && curr && samples[i].status !== "failed" && samples[i - 1].status !== "failed") {
      path += distance(prev, curr);
    }
  }
  if (path <= 0) return null;
  return distance(first.body, target) / path;
}

function perimeterOccupancy(samples: TrackingSample[], arena: ArenaGeometry): number | null {
  const visible = samples.filter((sample) => sample.body);
  if (visible.length === 0) return null;
  const outer = visible.filter((sample) => {
    const d = distance(sample.body!, arena.platformCenterPx);
    return d >= arena.platformRadiusPx * 0.62;
  });
  return outer.length / visible.length;
}

function centerCrossings(samples: TrackingSample[], arena: ArenaGeometry): number {
  let crossings = 0;
  let inside = false;
  const inner = arena.platformRadiusPx * 0.28;
  for (const sample of samples) {
    if (!sample.body) continue;
    const nowInside = distance(sample.body, arena.platformCenterPx) <= inner;
    if (nowInside && !inside) crossings += 1;
    inside = nowInside;
  }
  return crossings;
}

function visitSequence(events: BehavioralEvent[]): number[] {
  return events
    .filter((event) => event.type === "hole-investigation" || event.type === "target-investigation")
    .sort((a, b) => a.startSeconds - b.startSeconds)
    .map((event) => event.holeIndex)
    .filter((index): index is number => index !== undefined);
}

function transitionCounts(sequence: number[]): {
  transitionCount: number;
  adjacentTransitionCount: number;
  adjacencyRatio: number | null;
} {
  if (sequence.length < 2) {
    return { transitionCount: 0, adjacentTransitionCount: 0, adjacencyRatio: null };
  }
  let adjacentTransitionCount = 0;
  for (let i = 1; i < sequence.length; i += 1) {
    if (holesAreAdjacent(sequence[i - 1], sequence[i])) adjacentTransitionCount += 1;
  }
  const transitionCount = sequence.length - 1;
  return {
    transitionCount,
    adjacentTransitionCount,
    adjacencyRatio: adjacentTransitionCount / transitionCount,
  };
}

function directionalConsistency(sequence: number[], holeCount = 20): number | null {
  if (sequence.length < 3) return null;
  let plus = 0;
  let minus = 0;
  for (let i = 1; i < sequence.length; i += 1) {
    const step = (sequence[i] - sequence[i - 1] + holeCount) % holeCount;
    if (step === 1) plus += 1;
    if (step === holeCount - 1) minus += 1;
  }
  const directed = plus + minus;
  if (directed === 0) return 0;
  return Math.max(plus, minus) / directed;
}

export function deriveStrategyFeatures(options: {
  samples: TrackingSample[];
  events: BehavioralEvent[];
  arena: ArenaGeometry;
  metrics: TrialMetrics;
}): StrategyFeatures {
  const sequence = visitSequence(options.events);
  const transitions = transitionCounts(sequence);
  return {
    primaryErrors: options.metrics.primaryErrors ?? null,
    primaryLatencySeconds: options.metrics.primaryLatencySeconds ?? null,
    pathEfficiency: pathEfficiency(options.samples, options.arena),
    perimeterOccupancy: perimeterOccupancy(options.samples, options.arena),
    centerCrossings: centerCrossings(options.samples, options.arena),
    uniqueHolesInvestigated: new Set(sequence).size,
    transitionCount: transitions.transitionCount,
    adjacentTransitionCount: transitions.adjacentTransitionCount,
    adjacencyRatio: transitions.adjacencyRatio,
    directionalConsistency: directionalConsistency(sequence),
  };
}

export function classifyStrategy(
  features: StrategyFeatures,
  parameters: StrategyParameters,
): { label: SearchStrategyLabel; reasoning: string[] } {
  const reasoning: string[] = [];
  const errors = features.primaryErrors;
  const efficiency = features.pathEfficiency;
  const adjacency = features.adjacencyRatio;
  const perimeter = features.perimeterOccupancy;

  const spatial =
    errors !== null &&
    errors <= parameters.spatialMaxPrimaryErrors &&
    efficiency !== null &&
    efficiency >= parameters.spatialMinPathEfficiency;

  const serial =
    features.uniqueHolesInvestigated >= parameters.serialMinInvestigations &&
    adjacency !== null &&
    adjacency >= parameters.serialMinAdjacencyRatio &&
    perimeter !== null &&
    perimeter >= parameters.serialMinPerimeterOccupancy;

  if (errors !== null) {
    reasoning.push(
      `${errors} primary error${errors === 1 ? "" : "s"} before the first target investigation.`,
    );
  }
  if (efficiency !== null) {
    reasoning.push(`Path efficiency (straight-line to target / traveled path) is ${(efficiency * 100).toFixed(0)}%.`);
  }
  if (adjacency !== null) {
    const transitions = features.transitionCount ?? 0;
    const adjacent = features.adjacentTransitionCount ?? Math.round(adjacency * Math.max(transitions, 1));
    reasoning.push(
      `${adjacent} of ${transitions} consecutive hole transitions were adjacent (including hole 20 → 1).`,
    );
  }
  if (perimeter !== null) {
    reasoning.push(`${(perimeter * 100).toFixed(0)}% of tracked observations were in the outer arena.`);
  }
  if (features.directionalConsistency !== null) {
    reasoning.push(
      `Directional consistency of adjacent visits is ${(features.directionalConsistency * 100).toFixed(0)}%.`,
    );
  }

  if (spatial && !serial) {
    reasoning.unshift("Classified spatial/direct: few primary errors and a relatively efficient path to the target.");
    return { label: "spatial", reasoning };
  }
  if (serial && !spatial) {
    reasoning.unshift("Classified serial: successive hole visits are mostly adjacent with substantial perimeter search.");
    return { label: "serial", reasoning };
  }
  if (spatial && serial) {
    if ((adjacency ?? 0) >= 0.7 && (errors ?? 0) > 0) {
      reasoning.unshift("Both spatial and serial criteria were met; adjacency pattern is stronger, so serial is reported.");
      return { label: "serial", reasoning };
    }
    reasoning.unshift("Both spatial and serial criteria were met; path efficiency dominates, so spatial is reported.");
    return { label: "spatial", reasoning };
  }

  reasoning.unshift(
    "Classified random: the path does not meet the spatial (direct) or serial (adjacent-hole) rules.",
  );
  return { label: "random", reasoning };
}

export function computeStrategy(options: {
  samples: TrackingSample[];
  events: BehavioralEvent[];
  arena: ArenaGeometry;
  metrics: TrialMetrics;
  parameters: StrategyParameters;
  override?: SearchStrategyLabel;
}): SearchStrategyResult {
  const features = deriveStrategyFeatures(options);
  const automatic = classifyStrategy(features, options.parameters);
  return {
    automatic: automatic.label,
    effective: options.override ?? automatic.label,
    overridden: options.override !== undefined && options.override !== automatic.label,
    features,
    reasoning: automatic.reasoning,
  };
}

export function strategyOverrideFromCorrections(
  corrections: Array<{ kind: string; correctedValue?: unknown }>,
): SearchStrategyLabel | undefined {
  const last = [...corrections].reverse().find((item) => item.kind === "strategy-override");
  if (!last) return undefined;
  const value = last.correctedValue;
  if (value === "spatial" || value === "serial" || value === "random") return value;
  return undefined;
}

export function describeTargetQuadrantUse(samples: TrackingSample[], arena: ArenaGeometry): number {
  return samples.filter((sample) => sample.body && isInTargetQuadrant(sample.body, arena)).length;
}
