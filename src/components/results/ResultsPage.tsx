import { isTrackingStale } from "../../domain/trackingProvenance";
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
  const setStage = useSessionStore((state) => state.setStage);

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
      {isTrackingStale(trial.tracking) ? (
        <Banner kind="warn">Tracking settings changed. Re-run tracking to apply them. Exported tracking parameters are those of the existing run; pending settings are labeled separately.</Banner>
      ) : null}
      {!trial.tracking ? (
        <section className="empty-state">
          <h3>Results will appear after tracking and review.</h3>
        </section>
      ) : null}
      <section className="card" id="results-report">
        <dl className="metrics results-metrics">
          <MetricCard
            label="Primary latency"
            value={trial.metrics?.primaryLatencySeconds}
            unit="s"
            missing="No target investigation"
            definition="Time from trial start to the first valid investigation of the target hole."
          />
          <MetricCard
            label="Total latency"
            value={trial.metrics?.totalLatencySeconds}
            unit="s"
            missing="Escape not confirmed"
            definition="Time from trial start to a confirmed escape into the target hole."
            action={
              trial.metrics?.totalLatencySeconds == null ? (
                <button type="button" className="btn-ghost" onClick={() => setStage("review")}>
                  Review escape
                </button>
              ) : null
            }
          />
          <MetricCard
            label="Primary errors"
            value={trial.metrics?.primaryErrors}
            definition="Wrong-hole investigations occurring before the first valid target investigation."
          />
          <MetricCard
            label="Total errors"
            value={trial.metrics?.totalErrors}
            definition="Non-target hole investigations across the analyzed trial according to the configured event definition."
          />
          <MetricCard
            label="Path length"
            value={trial.metrics?.pathLengthCm}
            unit="cm"
            missing="Physical calibration required"
            action={
              trial.metrics?.pathLengthCm == null ? (
                <button type="button" className="btn-ghost" onClick={() => setStage("arena")}>
                  Set diameter
                </button>
              ) : null
            }
          />
          <MetricCard
            label="Mean speed"
            value={trial.metrics?.meanSpeedCmPerSec}
            unit="cm/s"
            missing="Physical calibration required"
          />
          <MetricCard
            label="Target quadrant"
            value={
              trial.metrics?.targetQuadrantTimeSeconds != null && trial.metrics.targetQuadrantPercent != null
                ? `${trial.metrics.targetQuadrantTimeSeconds.toFixed(2)} s · ${trial.metrics.targetQuadrantPercent.toFixed(1)}%`
                : undefined
            }
            definition="Time spent in the 90° sector centered on the target hole."
          />
          <MetricCard label="Strategy" value={trial.strategy?.effective} />
        </dl>
        {trial.arena && trial.tracking ? (
          <div className="results-figures">
            <div id="figure-trajectory" className="figure-primary">
              <h3>Trajectory</h3>
              <p className="help">Effective reviewed path</p>
              <TrajectoryPlot
                arena={trial.arena}
                samples={trial.tracking.effectiveSamples}
                title={`${trial.source.fileName} trajectory`}
                subtitle={meta || undefined}
              />
              <div className="row no-print">
                <span className="micro">Export figure</span>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    const svg = document.querySelector("#figure-trajectory svg");
                    if (svg) downloadSvg(svg, `${trial.source.fileName}-trajectory.svg`);
                  }}
                >
                  SVG
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    const svg = document.querySelector("#figure-trajectory svg");
                    if (svg) void downloadPngFromSvg(svg, `${trial.source.fileName}-trajectory.png`);
                  }}
                >
                  PNG
                </button>
              </div>
            </div>
            <section>
              <h3>Occupancy</h3>
              <p className="help">Valid automatic/manual tracking only; interpolated points excluded</p>
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
            <p className="help">
              Search strategy is classified from behavior up to the first valid target investigation. If no
              target investigation occurs, the available trial trajectory is used.
            </p>
            <p>
              Automatic classification: <strong>{trial.strategy.automatic}</strong>
              {trial.strategy.overridden
                ? ` · Researcher: ${trial.strategy.effective}`
                : " · Researcher classification: Same as automatic"}
            </p>
            <p>
              Effective: <strong>{trial.strategy.effective}</strong>
            </p>
            <fieldset className="strategy-override">
              <legend>Researcher classification</legend>
              {(["spatial", "serial", "random"] as SearchStrategyLabel[]).map((label) => (
                <label key={label}>
                  <input
                    type="radio"
                    name="strategy-override"
                    checked={trial.strategy?.effective === label}
                    onChange={() => overrideStrategy(trial.id, label)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <h4>Why {trial.strategy.effective}?</h4>
            <p className="help">{trial.strategy.reasoning[0]}</p>
            <h4>Evidence</h4>
            <ul>
              {trial.strategy.reasoning.slice(1).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
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
                <th>Effective coverage %</th>
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
                  <td>
                    {(item.qc?.effectiveTrajectoryCoveragePercent ?? item.qc?.trackingCoveragePercent)?.toFixed(1) ?? ""}
                  </td>
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
