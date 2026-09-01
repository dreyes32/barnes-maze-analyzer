import { currentTrialSelector, useSessionStore } from "../../state/sessionStore";
import { trialSummaryCsv, eventsCsv, trackingPointsCsv } from "../../export/csv";
import { downloadXlsx } from "../../export/xlsx";
import { downloadTextFile, safeFilename, sessionToPortableJson } from "../../export/analysisJson";
import { downloadSvg, downloadPngFromSvg } from "../../export/figures";
import { Banner, MetricCard, PageHeader, StatusBadge } from "../ui";
import { TrajectoryPlot } from "../charts/TrajectoryPlot";
import { EventRaster } from "../charts/EventRaster";
import { OccupancyHeatmap } from "../charts/OccupancyHeatmap";
import { MethodPanel } from "../method/MethodPanel";
import type { SearchStrategyLabel } from "../../domain/types";

export function ResultsPage() {
  const session = useSessionStore((state) => state.session);
  const trial = currentTrialSelector(session);
  const overrideStrategy = useSessionStore((state) => state.overrideStrategy);
  const markReviewed = useSessionStore((state) => state.markReviewed);
  const setError = useSessionStore((state) => state.setError);

  const exportCsv = () => {
    downloadTextFile(`${safeFilename(session.name)}-trial-summary.csv`, trialSummaryCsv(session), "text/csv");
    downloadTextFile(`${safeFilename(session.name)}-events.csv`, eventsCsv(session), "text/csv");
  };

  const exportAll = async () => {
    try {
      await downloadXlsx(session, `${safeFilename(session.name)}-results.xlsx`);
      downloadTextFile(`${safeFilename(session.name)}.barnes.json`, sessionToPortableJson(session));
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      zip.file("trial_summary.csv", trialSummaryCsv(session));
      zip.file("events.csv", eventsCsv(session));
      zip.file("tracking_points.csv", trackingPointsCsv(session));
      zip.file(`${safeFilename(session.name)}.barnes.json`, sessionToPortableJson(session));
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${safeFilename(session.name)}-analysis.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setError({
        title: "Export failed",
        detail: "The spreadsheet or package could not be created in this browser.",
        technical: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (!trial) {
    return (
      <section className="empty-state">
        <h2>Results</h2>
        <p className="help">Results will appear after tracking and review.</p>
      </section>
    );
  }

  const meta = [
    trial.experimentMetadata.animalId,
    trial.experimentMetadata.cohort,
    trial.experimentMetadata.day,
    trial.experimentMetadata.trial ? `Trial ${trial.experimentMetadata.trial}` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PageHeader title="Results">
        <p>
          {meta || trial.source.fileName}
          {" · "}
          <StatusBadge status={trial.reviewStatus} />
        </p>
      </PageHeader>
      {session.isDemo ? (
        <Banner kind="info">This is a labeled example analysis, not a newly executed run on this machine.</Banner>
      ) : null}
      {!trial.tracking ? (
        <section className="empty-state">
          <h3>Results will appear after tracking and review.</h3>
        </section>
      ) : null}
      <section className="card" id="results-report">
        <dl className="metrics">
          <MetricCard label="Primary latency" value={trial.metrics?.primaryLatencySeconds} unit="s" missing="No target investigation" />
          <MetricCard label="Total latency" value={trial.metrics?.totalLatencySeconds} unit="s" missing="Escape not confirmed" />
          <MetricCard label="Primary errors" value={trial.metrics?.primaryErrors} />
          <MetricCard label="Total errors" value={trial.metrics?.totalErrors} />
          <MetricCard
            label="Path length"
            value={trial.metrics?.pathLengthCm}
            unit="cm"
            missing="Enter platform diameter"
          />
          <MetricCard
            label="Mean speed"
            value={trial.metrics?.meanSpeedCmPerSec}
            unit="cm/s"
            missing="Enter platform diameter"
          />
          <MetricCard label="Target quadrant time" value={trial.metrics?.targetQuadrantTimeSeconds} unit="s" />
          <MetricCard label="Target quadrant" value={trial.metrics?.targetQuadrantPercent} unit="%" />
          <MetricCard label="Strategy" value={trial.strategy?.effective} />
        </dl>
        {trial.metrics?.unavailableReasons.map((reason) => (
          <Banner key={reason} kind="warn">{reason}</Banner>
        ))}
        {trial.arena && trial.tracking ? (
          <div className="results-figures">
            <div id="figure-trajectory" className="figure-primary">
              <h3>Trajectory</h3>
              <TrajectoryPlot
                arena={trial.arena}
                samples={trial.tracking.effectiveSamples}
                title={`${trial.source.fileName} trajectory`}
              />
              <div className="row no-print">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    const svg = document.querySelector("#figure-trajectory svg");
                    if (svg) downloadSvg(svg, `${trial.source.fileName}-trajectory.svg`);
                  }}
                >
                  Export SVG
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    const svg = document.querySelector("#figure-trajectory svg");
                    if (svg) void downloadPngFromSvg(svg, `${trial.source.fileName}-trajectory.png`);
                  }}
                >
                  Export PNG
                </button>
              </div>
            </div>
            <section>
              <h3>Tracking quality</h3>
              <OccupancyHeatmap arena={trial.arena} samples={trial.tracking.effectiveSamples} />
            </section>
          </div>
        ) : null}
        <section>
          <h3>Hole investigations</h3>
          <EventRaster
          events={trial.events}
          duration={trial.source.durationSeconds}
          arena={trial.arena}
          onSelect={() => undefined}
        />
        </section>
        {trial.strategy ? (
          <section>
            <h3>Search strategy</h3>
            <p>
              Automatic: <strong>{trial.strategy.automatic}</strong>
              {trial.strategy.overridden ? ` · Reviewer override: ${trial.strategy.effective}` : ""}
            </p>
            <ul>
              {trial.strategy.reasoning.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div className="row">
              {(["spatial", "serial", "random"] as SearchStrategyLabel[]).map((label) => (
                <button
                  key={label}
                  type="button"
                  className={trial.strategy?.effective === label ? "btn" : "btn-secondary"}
                  onClick={() => overrideStrategy(trial.id, label)}
                >
                  Use {label}
                </button>
              ))}
            </div>
          </section>
        ) : null}
        <LearningCurves />
        <h3>Trial table</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Animal</th>
                <th>Primary latency (s)</th>
                <th>Total latency (s)</th>
                <th>Primary errors</th>
                <th>Strategy</th>
                <th>Coverage %</th>
              </tr>
            </thead>
            <tbody>
              {session.trials.map((item) => (
                <tr key={item.id}>
                  <td>{item.source.fileName}</td>
                  <td>{item.experimentMetadata.animalId ?? ""}</td>
                  <td>{item.metrics?.primaryLatencySeconds ?? ""}</td>
                  <td>{item.metrics?.totalLatencySeconds ?? ""}</td>
                  <td>{item.metrics?.primaryErrors ?? ""}</td>
                  <td>{item.strategy?.effective ?? ""}</td>
                  <td>{item.qc?.trackingCoveragePercent?.toFixed(1) ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card no-print">
        <h3>Exports</h3>
        <div className="row">
          <button type="button" className="btn-secondary" onClick={exportCsv}>
            Download CSV
          </button>
          <button type="button" className="btn-secondary" onClick={() => void downloadXlsx(session, `${safeFilename(session.name)}-results.xlsx`)}>
            Download XLSX
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => downloadTextFile(`${safeFilename(session.name)}.barnes.json`, sessionToPortableJson(session))}
          >
            Download analysis file
          </button>
          <button type="button" className="btn-secondary" onClick={() => void exportAll()}>
            Download package
          </button>
          <button type="button" className="btn-secondary" onClick={() => window.print()}>
            Print / Save as PDF
          </button>
          <button type="button" className="btn-ghost" onClick={() => markReviewed(trial.id, "complete")}>
            Mark complete
          </button>
        </div>
        <p className="help">
          Missing numeric values export as empty cells, not zeroes. Empty / NA means the measure was not available.
        </p>
      </section>
      <MethodPanel />
    </>
  );
}

function LearningCurves() {
  const trials = useSessionStore((state) => state.session.trials);
  const grouped = new Map<string, typeof trials>();
  for (const trial of trials) {
    const animal = trial.experimentMetadata.animalId;
    if (!animal) continue;
    const list = grouped.get(animal) ?? [];
    list.push(trial);
    grouped.set(animal, list);
  }
  if (grouped.size === 0) {
    return <p className="help">Learning curves appear when the same animal ID is assigned to more than one trial.</p>;
  }
  return (
    <section>
      <h3>Learning curves</h3>
      {[...grouped.entries()].map(([animal, items]) => (
        <svg key={animal} viewBox="0 0 360 120" width="100%" role="img" aria-label={`Latencies for ${animal}`}>
          <text x={8} y={16} fontSize="12">{animal}</text>
          {items.map((trial, index) => {
            const y = 100 - Math.min(90, (trial.metrics?.primaryLatencySeconds ?? 0));
            return (
              <g key={trial.id}>
                <circle cx={40 + index * 40} cy={y} r={4} fill="#1f4d5c" />
                <text x={40 + index * 40} y={114} fontSize="9" textAnchor="middle">
                  {trial.experimentMetadata.trial ?? index + 1}
                </text>
              </g>
            );
          })}
        </svg>
      ))}
    </section>
  );
}
