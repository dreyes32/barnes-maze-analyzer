import { useRef, useState } from "react";
import { currentTrialSelector, useSessionStore } from "../../state/sessionStore";
import { getVideoUrl } from "../../state/videoRegistry";
import { runTrackingOnVideo } from "../../video/runTracking";
import { Banner, MetricCard } from "../ui";
import { MethodPanel } from "../method/MethodPanel";

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

  if (!trial) return <Banner kind="info">Import a video first.</Banner>;
  if (!trial.arena) return <Banner kind="warn">Set the arena before tracking.</Banner>;

  return (
    <>
      <section className="card">
        <h2>Track animal</h2>
        <p className="help">
          Background subtraction inside the platform, then a thick-core body location so the tail does not
          dominate. Failures stay failed unless you enable short-gap interpolation in Method settings.
        </p>
        {url ? <video ref={videoRef} src={url} muted playsInline controls style={{ maxWidth: "100%" }} /> : (
          <Banner kind="warn">Relink this video to run tracking.</Banner>
        )}
        <p className="help">
          Analysis sampling: {session.parameters.sampling.targetObservationsPerSecond} observations/s (source{" "}
          {trial.source.fps ? `${trial.source.fps.toFixed(3)} fps` : "timebase from media timestamps"}).
        </p>
        <div className="row">
          <button type="button" className="btn" onClick={() => void start()} disabled={tracking.running || !url}>
            {trial.tracking ? "Re-run tracking" : "Run tracking"}
          </button>
          <button
            type="button"
            className="btn-danger"
            disabled={!tracking.running}
            onClick={() => abortRef.current?.abort()}
          >
            Cancel
          </button>
          {trial.tracking ? (
            <button type="button" className="btn-secondary" onClick={() => setStage("review")}>
              Review tracking
            </button>
          ) : null}
        </div>
        {tracking.running ? (
          <Banner kind="info">
            {tracking.stage === "background" ? "Estimating background" : "Tracking"} {tracking.trialId === trial.id ? trial.source.fileName : ""}: {tracking.current} / {tracking.total} ({tracking.timestampSeconds.toFixed(1)} s)
            <progress max={tracking.total || 1} value={tracking.current} style={{ width: "100%" }} />
          </Banner>
        ) : null}
        {localError ? <Banner kind="danger">{localError}</Banner> : null}
      </section>
      {trial.qc ? (
        <section className="card">
          <h3>Quality</h3>
          <dl className="metrics">
            <MetricCard label="Observations" value={trial.qc.observationsAttempted} />
            <MetricCard label="Tracked" value={trial.qc.tracked} />
            <MetricCard label="Low confidence" value={trial.qc.lowConfidence} />
            <MetricCard label="Failed" value={trial.qc.failed} />
            <MetricCard label="Interpolated" value={trial.qc.interpolated} />
            <MetricCard label="Coverage" value={trial.qc.trackingCoveragePercent} unit="%" />
            <MetricCard label="Largest gap" value={trial.qc.largestMissingIntervalSeconds} unit="s" />
          </dl>
          {trial.qc.warnings.map((warning) => (
            <Banner key={warning} kind="warn">{warning}</Banner>
          ))}
        </section>
      ) : null}
      <MethodPanel />
    </>
  );
}
