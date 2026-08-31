import type { AnalysisSession, BehavioralEvent, TrackingSample, TrialRecord } from "../domain/types";

export const TRIAL_SUMMARY_COLUMNS = [
  "animal_id",
  "cohort",
  "day",
  "trial",
  "source_file",
  "duration_s",
  "primary_latency_s",
  "total_latency_s",
  "primary_errors",
  "total_errors",
  "path_length_cm",
  "mean_speed_cm_s",
  "target_quadrant_time_s",
  "target_quadrant_percent",
  "automatic_strategy",
  "final_strategy",
  "tracking_coverage_percent",
  "manual_correction_count",
  "review_status",
] as const;

const NA = "";

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return NA;
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function missingNumber(value: number | null | undefined): string {
  return value === null || value === undefined || Number.isNaN(value) ? NA : String(value);
}

export function trialSummaryRow(trial: TrialRecord): Record<(typeof TRIAL_SUMMARY_COLUMNS)[number], string> {
  return {
    animal_id: trial.experimentMetadata.animalId ?? NA,
    cohort: trial.experimentMetadata.cohort ?? NA,
    day: trial.experimentMetadata.day === undefined ? NA : String(trial.experimentMetadata.day),
    trial: trial.experimentMetadata.trial === undefined ? NA : String(trial.experimentMetadata.trial),
    source_file: trial.source.fileName,
    duration_s: trial.source.durationSeconds.toFixed(3),
    primary_latency_s: missingNumber(trial.metrics?.primaryLatencySeconds),
    total_latency_s: missingNumber(trial.metrics?.totalLatencySeconds),
    primary_errors: missingNumber(trial.metrics?.primaryErrors),
    total_errors: missingNumber(trial.metrics?.totalErrors),
    path_length_cm: missingNumber(trial.metrics?.pathLengthCm),
    mean_speed_cm_s: missingNumber(trial.metrics?.meanSpeedCmPerSec),
    target_quadrant_time_s: missingNumber(trial.metrics?.targetQuadrantTimeSeconds),
    target_quadrant_percent: missingNumber(trial.metrics?.targetQuadrantPercent),
    automatic_strategy: trial.strategy?.automatic ?? NA,
    final_strategy: trial.strategy?.effective ?? NA,
    tracking_coverage_percent: missingNumber(trial.qc?.trackingCoveragePercent),
    manual_correction_count: String(
      trial.corrections.filter((item) =>
        ["body-position", "head-position", "hidden-in-hole", "tracking-failure"].includes(item.kind),
      ).length,
    ),
    review_status: trial.reviewStatus,
  };
}

export function toCsv(headers: readonly string[], rows: Array<Record<string, string>>): string {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function trialSummaryCsv(session: AnalysisSession): string {
  return toCsv(
    TRIAL_SUMMARY_COLUMNS,
    session.trials.map((trial) => trialSummaryRow(trial)),
  );
}

export function eventsCsv(session: AnalysisSession): string {
  const headers = [
    "source_file",
    "animal_id",
    "event_id",
    "event_type",
    "hole_index_1based",
    "start_s",
    "end_s",
    "duration_s",
    "confidence",
    "source",
    "evidence",
  ];
  const rows = session.trials.flatMap((trial) =>
    trial.events.map((event: BehavioralEvent) => ({
      source_file: trial.source.fileName,
      animal_id: trial.experimentMetadata.animalId ?? "",
      event_id: event.id,
      event_type: event.type,
      hole_index_1based: event.holeIndex === undefined ? "" : String(event.holeIndex + 1),
      start_s: event.startSeconds.toFixed(3),
      end_s: event.endSeconds === undefined ? "" : event.endSeconds.toFixed(3),
      duration_s: event.durationSeconds === undefined ? "" : event.durationSeconds.toFixed(3),
      confidence: event.confidence.toFixed(3),
      source: event.source,
      evidence: event.evidence.join("; "),
    })),
  );
  return toCsv(headers, rows);
}

export function trackingPointsCsv(session: AnalysisSession): string {
  const headers = [
    "source_file",
    "timestamp_s",
    "frame_index",
    "body_x_px",
    "body_y_px",
    "head_x_px",
    "head_y_px",
    "confidence",
    "status",
    "source",
  ];
  const rows = session.trials.flatMap((trial) =>
    (trial.tracking?.effectiveSamples ?? []).map((sample: TrackingSample) => ({
      source_file: trial.source.fileName,
      timestamp_s: sample.timestampSeconds.toFixed(4),
      frame_index: sample.frameIndex === undefined ? "" : String(sample.frameIndex),
      body_x_px: sample.body ? sample.body.x.toFixed(2) : "",
      body_y_px: sample.body ? sample.body.y.toFixed(2) : "",
      head_x_px: sample.head ? sample.head.x.toFixed(2) : "",
      head_y_px: sample.head ? sample.head.y.toFixed(2) : "",
      confidence: sample.confidence.toFixed(3),
      status: sample.status,
      source: sample.source,
    })),
  );
  return toCsv(headers, rows);
}
