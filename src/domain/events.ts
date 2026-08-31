import { createId } from "./ids";
import {
  distance,
  investigationRadiusPx,
  nearestHoleIndex,
} from "./geometry";
import type {
  AnalysisParameters,
  ArenaGeometry,
  BehavioralEvent,
  CorrectionRecord,
  EventParameters,
  Point,
  TrackingSample,
} from "./types";

type Probe = {
  timestampSeconds: number;
  point?: Point;
  evidence: string;
  confidence: number;
  status: TrackingSample["status"];
};

function probeForSample(sample: TrackingSample): Probe {
  if (sample.head && (sample.headConfidence ?? 0) >= 0.45) {
    return {
      timestampSeconds: sample.timestampSeconds,
      point: sample.head,
      evidence: "high-confidence head entered region",
      confidence: sample.headConfidence ?? sample.confidence,
      status: sample.status,
    };
  }
  if (sample.body) {
    return {
      timestampSeconds: sample.timestampSeconds,
      point: sample.body,
      evidence:
        sample.head && (sample.headConfidence ?? 0) < 0.45
          ? "body/contour evidence only; head orientation uncertain"
          : "body position used as investigation probe",
      confidence: Math.min(sample.confidence, sample.head ? 0.7 : 0.6),
      status: sample.status,
    };
  }
  return {
    timestampSeconds: sample.timestampSeconds,
    confidence: sample.confidence,
    status: sample.status,
    evidence:
      sample.status === "hidden"
        ? "marked hidden / in a hole"
        : "no reliable probe this observation",
  };
}

type RawVisit = {
  holeIndex: number;
  startSeconds: number;
  endSeconds: number;
  evidence: Set<string>;
  confidence: number;
};

export function detectHoleInvestigations(
  samples: TrackingSample[],
  arena: ArenaGeometry,
  parameters: EventParameters,
): BehavioralEvent[] {
  const enterRadius = investigationRadiusPx(
    arena,
    parameters.fallbackInvestigationRadiusPx,
    parameters.investigationRadiusCm,
  );
  const remainRadius = enterRadius * parameters.hysteresisFactor;

  const raw: RawVisit[] = [];
  let active: RawVisit | null = null;

  for (const sample of samples) {
    const probe = probeForSample(sample);
    if (!probe.point) {
      if (active && sample.timestampSeconds - active.endSeconds > parameters.separationSeconds) {
        raw.push(active);
        active = null;
      }
      continue;
    }

    if (active && sample.timestampSeconds - active.endSeconds > parameters.separationSeconds) {
      raw.push(active);
      active = null;
    }

    const nearest = nearestHoleIndex(probe.point, arena);
    const inEnter = nearest.distancePx <= enterRadius;
    const inRemain = nearest.distancePx <= remainRadius;

    if (active) {
      if (nearest.index === active.holeIndex && inRemain) {
        active.endSeconds = sample.timestampSeconds;
        active.evidence.add(probe.evidence);
        active.confidence = Math.max(active.confidence, probe.confidence);
        continue;
      }
      if (sample.timestampSeconds - active.endSeconds <= parameters.separationSeconds && inEnter) {
        if (nearest.index === active.holeIndex) {
          active.endSeconds = sample.timestampSeconds;
          active.evidence.add(probe.evidence);
          continue;
        }
      }
      raw.push(active);
      active = null;
    }

    if (inEnter) {
      active = {
        holeIndex: nearest.index,
        startSeconds: sample.timestampSeconds,
        endSeconds: sample.timestampSeconds,
        evidence: new Set([probe.evidence]),
        confidence: probe.confidence,
      };
    }
  }
  if (active) raw.push(active);

  const visits = raw
    .map((visit) => ({
      ...visit,
      duration: visit.endSeconds - visit.startSeconds,
    }))
    .filter((visit) => visit.duration >= parameters.minInvestigationSeconds);

  const events: BehavioralEvent[] = visits.map((visit) => ({
    id: createId("evt"),
    type: investigationTypeForHole(visit.holeIndex, arena.targetHoleIndex),
    holeIndex: visit.holeIndex,
    startSeconds: visit.startSeconds,
    endSeconds: visit.endSeconds,
    durationSeconds: visit.duration,
    confidence: visit.confidence,
    evidence: [...visit.evidence],
    source: "automatic",
  }));

  const firstTarget = events.find((event) => event.type === "target-investigation");
  if (firstTarget) {
    firstTarget.evidence = [...firstTarget.evidence, "first valid investigation of the target hole"];
  } else {
    events
      .filter((event) => event.holeIndex === arena.targetHoleIndex)
      .forEach((event) => {
        event.type = "target-investigation";
      });
  }

  return events;
}

export function investigationTypeForHole(
  holeIndex: number,
  targetHoleIndex: number,
): BehavioralEvent["type"] {
  return holeIndex === targetHoleIndex ? "target-investigation" : "hole-investigation";
}

function mostRecentPriorTargetVisit(
  visits: BehavioralEvent[],
  targetHoleIndex: number,
  disappearanceStart: number,
): BehavioralEvent | undefined {
  return visits
    .filter((event) => event.holeIndex === targetHoleIndex)
    .filter((event) => (event.endSeconds ?? event.startSeconds) <= disappearanceStart)
    .sort((a, b) => (a.endSeconds ?? a.startSeconds) - (b.endSeconds ?? b.startSeconds))
    .at(-1);
}

export function inferEscapeEntry(
  samples: TrackingSample[],
  arena: ArenaGeometry,
  parameters: EventParameters,
  visits: BehavioralEvent[],
): BehavioralEvent | null {
  const target = arena.holeCentersPx[arena.targetHoleIndex];
  if (!target) return null;

  const proximityPx =
    investigationRadiusPx(arena, parameters.fallbackInvestigationRadiusPx, parameters.escapeProximityCm) ??
    parameters.fallbackInvestigationRadiusPx;

  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i];
    if (sample.status !== "failed" && sample.status !== "hidden") continue;

    let start = i;
    while (
      start > 0 &&
      (samples[start - 1].status === "failed" || samples[start - 1].status === "hidden")
    ) {
      start -= 1;
    }
    let end = i;
    while (
      end + 1 < samples.length &&
      (samples[end + 1].status === "failed" || samples[end + 1].status === "hidden")
    ) {
      end += 1;
    }

    const duration = samples[end].timestampSeconds - samples[start].timestampSeconds;
    if (duration < parameters.escapeDisappearanceSeconds) {
      i = end;
      continue;
    }

    const before = [...samples.slice(Math.max(0, start - 8), start)].reverse().find((item) => item.body);
    if (!before?.body) {
      i = end;
      continue;
    }

    const nearTarget = distance(before.body, target) <= proximityPx;
    const towardTarget =
      before.body &&
      samples[Math.max(0, start - 3)]?.body &&
      distance(before.body, target) <=
        distance(samples[Math.max(0, start - 3)].body as Point, target) + 4;

    const disappearanceStart = samples[start].timestampSeconds;
    const priorTargetVisit = mostRecentPriorTargetVisit(visits, arena.targetHoleIndex, disappearanceStart);
    const visitEnd = priorTargetVisit
      ? (priorTargetVisit.endSeconds ?? priorTargetVisit.startSeconds)
      : undefined;
    const sinceVisit = visitEnd === undefined ? undefined : disappearanceStart - visitEnd;
    const visitedTargetRecently = sinceVisit !== undefined && sinceVisit >= 0 && sinceVisit <= 2.5;

    if (!nearTarget) {
      i = end;
      continue;
    }

    const evidence = [
      "mouse recently positioned at or near the target hole",
      `then undetectable for ${duration.toFixed(2)} s`,
      "disappearance is spatially consistent with target entry",
    ];
    if (towardTarget) evidence.push("trajectory moved toward the target");
    if (visitedTargetRecently) evidence.push("target investigation shortly before disappearance");

    const confidence = nearTarget && visitedTargetRecently && towardTarget ? 0.72 : 0.48;

    return {
      id: createId("esc"),
      type: "escape-entry",
      holeIndex: arena.targetHoleIndex,
      startSeconds: samples[start].timestampSeconds,
      endSeconds: samples[end].timestampSeconds,
      durationSeconds: duration,
      confidence,
      evidence,
      source: "automatic",
    };
  }

  return null;
}

export function applyEventCorrections(
  events: BehavioralEvent[],
  corrections: CorrectionRecord[],
): BehavioralEvent[] {
  let next = [...events];
  for (const correction of corrections) {
    if (correction.kind === "event-remove") {
      const id = (correction.correctedValue as { id?: string } | undefined)?.id;
      if (id) next = next.filter((event) => event.id !== id);
    } else if (correction.kind === "event-add") {
      const event = correction.correctedValue as BehavioralEvent;
      if (event) next.push({ ...event, source: event.source === "automatic" ? "automatic-confirmed" : "manual" });
    } else if (correction.kind === "event-edit") {
      const event = correction.correctedValue as BehavioralEvent;
      if (event) {
        next = next.map((item) => (item.id === event.id ? { ...event } : item));
      }
    }
  }
  return next.sort((a, b) => a.startSeconds - b.startSeconds);
}

export function detectEvents(
  samples: TrackingSample[],
  arena: ArenaGeometry,
  parameters: AnalysisParameters,
  corrections: CorrectionRecord[] = [],
): BehavioralEvent[] {
  const visits = detectHoleInvestigations(samples, arena, parameters.events);
  const escape = inferEscapeEntry(samples, arena, parameters.events, visits);
  const automatic = escape ? [...visits, escape] : visits;
  return applyEventCorrections(automatic, corrections);
}
