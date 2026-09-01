import type { ReactNode } from "react";
import type { ReviewStatus } from "../domain/types";
import { reviewStatusLabel, reviewStatusMark } from "../domain/session";

export function StatusBadge({ status }: { status: ReviewStatus }) {
  return (
    <span className={`status status-pill status-${status}`}>
      <span className="status-mark" aria-hidden="true">
        {reviewStatusMark(status)}
      </span>
      <span>{reviewStatusLabel(status)}</span>
    </span>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="page-header">
      <h2>{title}</h2>
      {children}
    </header>
  );
}

export function WorkspaceFooter({ note, children }: { note?: string; children: ReactNode }) {
  return (
    <div className="workspace-footer">
      <p className="help">{note}</p>
      <div className="row">{children}</div>
    </div>
  );
}

export function Callout({
  kind = "info",
  children,
}: {
  kind?: "warn" | "danger" | "ok" | "info";
  children: ReactNode;
}) {
  return (
    <div className={`callout compact ${kind}`} role={kind === "danger" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function Banner({
  kind,
  children,
}: {
  kind: "warn" | "danger" | "ok" | "info";
  children: ReactNode;
}) {
  return (
    <div className={`banner ${kind}`} role={kind === "danger" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="field">
      <label>
        {label}
        {children}
      </label>
      {hint ? <span className="help">{hint}</span> : null}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  unit,
  missing,
  definition,
  action,
}: {
  label: string;
  value?: number | null | string;
  unit?: string;
  missing?: string;
  definition?: string;
  action?: ReactNode;
}) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className="metric">
      <dt>
        <span>{label}</span>
        {definition ? (
          <button type="button" className="metric-info" title={definition} aria-label={`${label}: ${definition}`}>
            ⓘ
          </button>
        ) : null}
      </dt>
      <dd>
        {empty ? (
          <span className="na">{missing ?? "Unavailable"}</span>
        ) : (
          <>
            {typeof value === "number"
              ? Number.isInteger(value)
                ? value.toLocaleString()
                : value.toFixed(2)
              : value}
            {unit ? ` ${unit}` : ""}
          </>
        )}
        {action}
      </dd>
    </div>
  );
}

export function formatSeconds(value?: number | null): string { // eslint-disable-line react-refresh/only-export-components
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(2)} s`;
}
