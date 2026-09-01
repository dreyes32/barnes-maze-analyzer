import type { BehavioralEventType } from "./types";

export function createId(prefix = "id"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 12)}_${Date.now().toString(36)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Microsecond integer used in deterministic automatic event IDs. */
export function normalizeEventTimestamp(seconds: number): number {
  return Math.round(seconds * 1_000_000);
}

/**
 * Stable identity for an automatic detection. Same trajectory + parameters +
 * boundaries must produce the same ID so event-remove / event-edit survive recomputation.
 * Manual events keep UUID IDs from createId().
 */
export function autoEventId(parts: {
  type: BehavioralEventType;
  holeIndex?: number;
  startSeconds: number;
  endSeconds?: number;
}): string {
  const hole = parts.holeIndex === undefined ? "na" : String(parts.holeIndex);
  const start = normalizeEventTimestamp(parts.startSeconds);
  const end = normalizeEventTimestamp(parts.endSeconds ?? parts.startSeconds);
  return `auto_${parts.type}_${hole}_${start}_${end}`;
}
