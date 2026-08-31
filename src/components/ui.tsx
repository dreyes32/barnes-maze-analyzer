import type { ReactNode } from "react";
import type { ReviewStatus } from "../domain/types";
import { reviewStatusLabel } from "../domain/session";

export function StatusBadge({ status }: { status: ReviewStatus }) {
  return (
    <span className={`status-pill status-${status}`}>
      <span className="status-dot" aria-hidden="true" />
      <span>{reviewStatusLabel(status)}</span>
    </span>
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
}: {
  label: string;
  value?: number | null | string;
  unit?: string;
  missing?: string;
}) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className="metric">
      <dt>{label}</dt>
      <dd>
        {empty ? (
          <span className="na">{missing ?? "Unavailable"}</span>
        ) : (
          <>
            {typeof value === "number" ? (Number.isInteger(value) ? value : value.toFixed(2)) : value}
            {unit ? ` ${unit}` : ""}
          </>
        )}
      </dd>
    </div>
  );
}

export function formatSeconds(value?: number | null): string { // eslint-disable-line react-refresh/only-export-components
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(2)} s`;
}
