import { useRef, useState } from "react";
import { buildReviewIssues } from "../../domain/qc";
import { isTrackingStale } from "../../domain/trackingProvenance";
import { currentTrialSelector, useSessionStore } from "../../state/sessionStore";
import { getVideoUrl } from "../../state/videoRegistry";
import { runTrackingOnVideo } from "../../video/runTracking";
import { Banner, MetricCard, PageHeader, WorkspaceFooter } from "../ui";
import { MethodPanel } from "../method/MethodPanel";

function JobStep({
  label,
  state,
  detail,
}: {
  label: string;
  state: "done" | "active" | "waiting";
  detail?: string;
}) {
  const mark = state === "done" ? "✓" : state === "active" ? "●" : "○";
  return (
    <li className={`job-step job-step-${state}`}>
      <span className="status-mark" aria-hidden="true">
        {mark}
      </span>
      <span>
        {label}
        {detail ? <span className="help"> {detail}</span> : null}
      </span>
    </li>
  );
}

export function TrackPage() {
  const session = useSessionStore((state) => state.session);
  const trial = currentTrialSelector(session);
  const setTrackingResult = useSessionStore((state) => state.setTrackingResult);
  const setTrackingProgress = useSessionStore((state) => state.setTrackingProgress);
  const tracking = useSessionStore((state) => state.tracking);
  const setError = useSessionStore((state) => state.setError);
  const setStage = useSessionStore((state) => state.setStage);
  const videoRef = useRef<HTMLVideoElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [localError, setLocalError] = useState<string>();
  const url = trial ? getVideoUrl(trial.id) : undefined;

  const start = async () => {
    if (!trial?.arena || !videoRef.current) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setTrackingProgress({ running: true, cancelled: false, trialId: trial.id, current: 0, total: 0 });
    try {
      const result = await runTrackingOnVideo({
        video: videoRef.current,
        arena: trial.arena,
        parameters: session.parameters,
        trialLabel: trial.source.fileName,
        signal: controller.signal,
        onProgress: (progress) => setTrackingProgress({ running: true, ...progress, trialId: trial.id }),
      });
      setTrackingResult(trial.id, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tracking failed.";
      setLocalError(message);
      setError({
        title: "Tracking stopped",
        detail: "The tracker could not finish this video. Details are available below.",
        technical: message,
      });
    } finally {
      setTrackingProgress({ running: false });
    }
  };

  if (!trial) {
    return (
      <section className="empty-state">
        <h2>Track</h2>
        <p className="help">Import a video first.</p>
      </section>
    );
  }
  if (!trial.arena) {
    return (
      <section className="empty-state">
        <h2>Track</h2>
        <p className="help">Configure the arena, then start tracking.</p>
        <button type="button" className="btn" onClick={() => setStage("arena")}>
          Continue to Arena →
        </button>
      </section>
    );
  }

  const runningThis = tracking.running && tracking.trialId === trial.id;
  const percent = tracking.total ? Math.round((tracking.current / tracking.total) * 100) : 0;
  const issues = trial.tracking ? buildReviewIssues(trial) : [];

  return (
    <>
      <PageHeader title="Track">
        <p>
          {runningThis
            ? `Tracking ${trial.source.fileName}`
            : trial.tracking
              ? `Tracking complete for ${trial.source.fileName}`
              : `Run animal tracking on ${trial.source.fileName}`}
        </p>
      </PageHeader>
      <section className="card">
        <p className="help">
          Background subtraction inside the platform, then a thick-core body location so the tail does not
          dominate. Failures stay failed unless you enable short-gap interpolation in Method settings.
        </p>
        <div className={trial.tracking && !runningThis ? "track-layout" : undefined}>
          <div>
            {url ? <video ref={videoRef} src={url} muted playsInline controls style={{ maxWidth: "100%" }} /> : (
              <Banner kind="warn">Relink this video to run tracking.</Banner>
            )}
            <p className="help">
              Analysis sampling: {trial.tracking?.analysisSamplingHz ?? session.parameters.sampling.targetObservationsPerSecond}{" "}
              observations/s used
              {isTrackingStale(trial.tracking)
                ? ` · pending ${session.parameters.sampling.targetObservationsPerSecond} observations/s`
                : ""}{" "}
              (source {trial.source.fps ? `${trial.source.fps.toFixed(3)} fps` : "timebase from media timestamps"}).
            </p>
            {isTrackingStale(trial.tracking) ? (
              <Banner kind="warn">Tracking settings changed. Re-run tracking to apply them.</Banner>
            ) : null}
            {runningThis ? (
              <div className="panel" style={{ marginTop: 16 }}>
                <ol className="setup-list">
                  <JobStep
                    label="Background estimation"
                    state={tracking.stage === "background" ? "active" : "done"}
                    detail={tracking.stage === "background" && tracking.total ? `${tracking.current} / ${tracking.total}` : undefined}
                  />
                  <JobStep
                    label="Animal tracking"
                    state={tracking.stage === "tracking" ? "active" : "waiting"}
                    detail={tracking.stage === "tracking" ? `${percent}%` : undefined}
                  />
                </ol>
                <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={tracking.total || 1} aria-valuenow={tracking.current}>
                  <span style={{ width: `${percent}%` }} />
                </div>
                <p className="help" style={{ marginTop: 8 }}>
                  Sample {tracking.current.toLocaleString()} / {tracking.total.toLocaleString()}
                  {tracking.timestampSeconds ? ` · ${tracking.timestampSeconds.toFixed(1)} s` : ""}
                </p>
                <button type="button" className="btn-danger" onClick={() => abortRef.current?.abort()}>
                  Cancel tracking
                </button>
              </div>
            ) : (
              <div className="row">
                <button type="button" className="btn" onClick={() => void start()} disabled={!url}>
                  {trial.tracking ? "Re-run tracking" : "Start tracking"}
                </button>
              </div>
            )}
          </div>
          {trial.tracking && trial.qc && !runningThis ? (
            <aside className="panel">
              <h3>Tracking complete</h3>
              <dl className="metrics compact-metrics">
                <MetricCard
                  label="Automatic tracking"
                  value={trial.qc.automaticTrackingCoveragePercent ?? trial.qc.trackingCoveragePercent}
                  unit="%"
                />
                <MetricCard
                  label="Effective trajectory"
                  value={trial.qc.effectiveTrajectoryCoveragePercent ?? trial.qc.trackingCoveragePercent}
                  unit="%"
                />
                <MetricCard label="Low confidence" value={trial.qc.lowConfidence} />
                <MetricCard label="Failed" value={trial.qc.failed} />
                <MetricCard label="Interpolated" value={trial.qc.interpolated} />
                <MetricCard label="Review issues" value={issues.length} />
                <MetricCard label="Largest gap" value={trial.qc.largestMissingIntervalSeconds} unit="s" />
              </dl>
              <button type="button" className="btn" onClick={() => setStage("review")}>
                Review tracking →
              </button>
            </aside>
          ) : null}
        </div>
        {localError ? <Banner kind="danger">{localError}</Banner> : null}
      </section>

      {!trial.tracking && !runningThis ? (
        <section className="empty-state">
          <h3>Tracking has not been run for this trial.</h3>
          <p className="help">Configure the arena, then start tracking.</p>
        </section>
      ) : null}

      {trial.tracking && trial.qc && !runningThis ? (
        <section>
          <h3>Quality detail</h3>
          <dl className="metrics">
            <MetricCard label="Observations" value={trial.qc.observationsAttempted} />
            <MetricCard label="Tracked" value={trial.qc.tracked} />
            <MetricCard label="Low confidence" value={trial.qc.lowConfidence} />
            <MetricCard label="Failed" value={trial.qc.failed} />
            <MetricCard label="Interpolated" value={trial.qc.interpolated} />
            <MetricCard
              label="Automatic tracking"
              value={trial.qc.automaticTrackingCoveragePercent ?? trial.qc.trackingCoveragePercent}
              unit="%"
            />
            <MetricCard
              label="Effective trajectory"
              value={trial.qc.effectiveTrajectoryCoveragePercent ?? trial.qc.trackingCoveragePercent}
              unit="%"
            />
            <MetricCard label="Largest gap" value={trial.qc.largestMissingIntervalSeconds} unit="s" />
          </dl>
          {trial.qc.warnings.map((warning) => (
            <Banner key={warning} kind="warn">{warning}</Banner>
          ))}
        </section>
      ) : null}

      <WorkspaceFooter
        note={
          trial.tracking
            ? `Tracking complete${issues.length ? ` · ${issues.length} issues` : ""}`
            : "Start tracking to continue"
        }
      >
        <button type="button" className="btn" disabled={!trial.tracking} onClick={() => setStage("review")}>
          Continue to Review →
        </button>
      </WorkspaceFooter>
      <MethodPanel />
    </>
  );
}
