import type { AnalysisSession } from "../domain/types";
import { TRIAL_SUMMARY_COLUMNS, trialSummaryRow } from "./csv";

function applyHeader(row: { font?: object; commit: () => void }): void {
  row.font = { bold: true };
  row.commit();
}

export async function sessionToWorkbookBlob(session: AnalysisSession): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Barnes Maze Analyzer";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Trial Summary");
  summary.addRow([...TRIAL_SUMMARY_COLUMNS]);
  applyHeader(summary.getRow(1));
  summary.views = [{ state: "frozen", ySplit: 1 }];
  for (const trial of session.trials) {
    const row = trialSummaryRow(trial);
    summary.addRow(TRIAL_SUMMARY_COLUMNS.map((column) => {
      const value = row[column];
      if (value === "") return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) && !["animal_id", "cohort", "day", "trial", "source_file", "automatic_strategy", "final_strategy", "review_status"].includes(column)
        ? numeric
        : value;
    }));
  }
  summary.columns.forEach((column) => {
    column.width = 22;
  });

  const events = workbook.addWorksheet("Events");
  events.addRow([
    "source_file",
    "animal_id",
    "event_type",
    "hole_number",
    "start_s",
    "end_s",
    "duration_s",
    "confidence",
    "source",
    "evidence",
  ]);
  applyHeader(events.getRow(1));
  events.views = [{ state: "frozen", ySplit: 1 }];
  for (const trial of session.trials) {
    for (const event of trial.events) {
      events.addRow([
        trial.source.fileName,
        trial.experimentMetadata.animalId ?? null,
        event.type,
        event.holeIndex === undefined ? null : event.holeIndex + 1,
        event.startSeconds,
        event.endSeconds ?? null,
        event.durationSeconds ?? null,
        event.confidence,
        event.source,
        event.evidence.join("; "),
      ]);
    }
  }
  events.columns.forEach((column) => {
    column.width = 20;
  });

  const tracking = workbook.addWorksheet("Tracking");
  tracking.addRow([
    "source_file",
    "timestamp_s",
    "body_x_px",
    "body_y_px",
    "confidence",
    "status",
    "source",
  ]);
  applyHeader(tracking.getRow(1));
  tracking.views = [{ state: "frozen", ySplit: 1 }];
  for (const trial of session.trials) {
    for (const sample of trial.tracking?.effectiveSamples ?? []) {
      tracking.addRow([
        trial.source.fileName,
        sample.timestampSeconds,
        sample.body?.x ?? null,
        sample.body?.y ?? null,
        sample.confidence,
        sample.status,
        sample.source,
      ]);
    }
  }

  const parameters = workbook.addWorksheet("Parameters");
  parameters.addRow(["section", "parameter", "value"]);
  applyHeader(parameters.getRow(1));
  parameters.addRow(["provenance", "application_version", session.appVersion]);
  parameters.addRow(["provenance", "schema_version", session.schemaVersion]);
  parameters.addRow(["provenance", "session_name", session.name]);
  parameters.addRow(["provenance", "analyzed_at", session.updatedAt]);
  const walk = (prefix: string, value: unknown) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.entries(value).forEach(([key, child]) => walk(`${prefix}${prefix ? "." : ""}${key}`, child));
    } else {
      const [section, ...rest] = prefix.split(".");
      parameters.addRow([section, rest.join(".") || section, String(value)]);
    }
  };
  walk("", session.parameters);

  const qc = workbook.addWorksheet("QC");
  qc.addRow([
    "source_file",
    "observations_attempted",
    "tracked",
    "low_confidence",
    "failed",
    "hidden",
    "interpolated",
    "manual",
    "largest_missing_interval_s",
    "tracking_coverage_percent",
    "warnings",
  ]);
  applyHeader(qc.getRow(1));
  for (const trial of session.trials) {
    qc.addRow([
      trial.source.fileName,
      trial.qc?.observationsAttempted ?? null,
      trial.qc?.tracked ?? null,
      trial.qc?.lowConfidence ?? null,
      trial.qc?.failed ?? null,
      trial.qc?.hidden ?? null,
      trial.qc?.interpolated ?? null,
      trial.qc?.manual ?? null,
      trial.qc?.largestMissingIntervalSeconds ?? null,
      trial.qc?.trackingCoveragePercent ?? null,
      trial.qc?.warnings.join(" | ") ?? null,
    ]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export async function sessionToWorkbookBuffer(session: AnalysisSession): Promise<ArrayBuffer> {
  const blob = await sessionToWorkbookBlob(session);
  return blob.arrayBuffer();
}

export async function downloadXlsx(session: AnalysisSession, filename: string): Promise<void> {
  const blob = await sessionToWorkbookBlob(session);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
