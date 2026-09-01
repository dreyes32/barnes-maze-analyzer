import { useEffect, useMemo, useRef, useState } from "react";
import { investigationTypeForHole } from "../../domain/events";
import { createId } from "../../domain/ids";
import { buildReviewIssues } from "../../domain/qc";
import { describeTimebase, sourceFrameDurationSeconds } from "../../domain/timebase";
import type { BehavioralEvent, Point } from "../../domain/types";
import { currentTrialSelector, useSessionStore } from "../../state/sessionStore";
import { getVideoUrl } from "../../state/videoRegistry";
import { Banner, PageHeader, WorkspaceFooter } from "../ui";
import { MethodPanel } from "../method/MethodPanel";

function nearestSampleIndex(samples: Array<{ timestampSeconds: number }>, time: number): number {
  let best = 0;
  let delta = Number.POSITIVE_INFINITY;
  samples.forEach((sample, index) => {
    const d = Math.abs(sample.timestampSeconds - time);
    if (d < delta) {
      delta = d;
      best = index;
    }
  });
  return best;
}

export function ReviewPage() {
  const session = useSessionStore((state) => state.session);
  const trial = currentTrialSelector(session);
  const addCorrection = useSessionStore((state) => state.addCorrection);
  const undoLastCorrection = useSessionStore((state) => state.undoLastCorrection);
  const markReviewed = useSessionStore((state) => state.markReviewed);
  const setStage = useSessionStore((state) => state.setStage);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [index, setIndex] = useState(0);
  const [reviewTime, setReviewTime] = useState(0);
  const [issueIndex, setIssueIndex] = useState(0);
  const [mode, setMode] = useState<"body" | "head">("body");
  const [editEventId, setEditEventId] = useState<string | null>(null);
  const [editHole, setEditHole] = useState(1);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [addHole, setAddHole] = useState(1);
  const url = trial ? getVideoUrl(trial.id) : undefined;
  const samples = trial?.tracking?.effectiveSamples ?? [];
  const issues = useMemo(() => (trial ? buildReviewIssues(trial) : []), [trial]);
  const sample = samples[index];
  const frameDuration = trial ? sourceFrameDurationSeconds(trial.source) : undefined;
  const reviewTimestamp = () => videoRef.current?.currentTime ?? reviewTime;

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !trial?.arena || !sample) return;
    const draw = () => {
      canvas.width = video.clientWidth;
      canvas.height = video.clientHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx || !video.videoWidth) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const sx = canvas.width / video.videoWidth;
      const sy = canvas.height / video.videoHeight;
      ctx.strokeStyle = "#1f4d5c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(
        trial.arena!.platformCenterPx.x * sx,
        trial.arena!.platformCenterPx.y * sy,
        trial.arena!.platformRadiusPx * sx,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      trial.arena!.holeCentersPx.forEach((hole, holeIndex) => {
        ctx.setLineDash(holeIndex === trial.arena!.targetHoleIndex ? [] : [3, 3]);
        ctx.strokeStyle = holeIndex === trial.arena!.targetHoleIndex ? "#6b2d2d" : "#3d2a78";
        ctx.beginPath();
        ctx.arc(hole.x * sx, hole.y * sy, trial.arena!.holeRadiusPx * sx, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#fff";
        ctx.fillText(String(holeIndex + 1), hole.x * sx + 4, hole.y * sy - 4);
      });
      if (sample.body) {
        ctx.fillStyle = sample.source === "manual" ? "#3d2a78" : "#1f4d5c";
        ctx.beginPath();
        if (sample.source === "manual") {
          ctx.rect(sample.body.x * sx - 5, sample.body.y * sy - 5, 10, 10);
        } else if (sample.source === "interpolated") {
          ctx.arc(sample.body.x * sx, sample.body.y * sy, 5, 0, Math.PI * 2);
        } else {
          ctx.arc(sample.body.x * sx, sample.body.y * sy, 5, 0, Math.PI * 2);
        }
        ctx.fill();
        if (sample.source === "manual") {
          ctx.fillStyle = "#3d2a78";
          ctx.fillText("Manual", sample.body.x * sx + 8, sample.body.y * sy);
        }
      }
      if (sample.head) {
        ctx.fillStyle = "#7a4b00";
        ctx.beginPath();
        ctx.moveTo(sample.head.x * sx, sample.head.y * sy - 6);
        ctx.lineTo(sample.head.x * sx + 5, sample.head.y * sy + 5);
        ctx.lineTo(sample.head.x * sx - 5, sample.head.y * sy + 5);
        ctx.closePath();
        ctx.fill();
      }
    };
    draw();
    video.addEventListener("seeked", draw);
    window.addEventListener("resize", draw);
    return () => {
      video.removeEventListener("seeked", draw);
      window.removeEventListener("resize", draw);
    };
  }, [sample, trial]);

  const seekToTime = (time: number) => {
    const clamped = Math.max(0, time);
    setReviewTime(clamped);
    setIndex(nearestSampleIndex(samples, clamped));
    if (videoRef.current) videoRef.current.currentTime = clamped;
  };

  const seekTo = (nextIndex: number) => {
    const clamped = Math.max(0, Math.min(samples.length - 1, nextIndex));
    setIndex(clamped);
    const next = samples[clamped];
    if (next) {
      setReviewTime(next.timestampSeconds);
      if (videoRef.current) videoRef.current.currentTime = next.timestampSeconds;
    }
  };

  const stepSourceFrame = (direction: -1 | 1) => {
    if (!frameDuration) return;
    const video = videoRef.current;
    const from = video?.currentTime ?? reviewTime;
    const next = Math.max(0, from + direction * frameDuration);
    const limit = video && Number.isFinite(video.duration) ? video.duration : next;
    const target = Math.min(next, limit);
    if (video) {
      video.currentTime = target;
      const applyPresented = (mediaTime: number) => {
        setReviewTime(mediaTime);
        setIndex(nearestSampleIndex(samples, mediaTime));
      };
      if (typeof video.requestVideoFrameCallback === "function") {
        video.requestVideoFrameCallback((_now, meta) => applyPresented(meta.mediaTime));
      } else {
        applyPresented(target);
      }
    } else {
      setReviewTime(target);
      setIndex(nearestSampleIndex(samples, target));
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (event.shiftKey) stepSourceFrame(-1);
        else seekTo(index - 1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (event.shiftKey) stepSourceFrame(1);
        else seekTo(index + 1);
      }
      if (event.key === " " && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault();
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) void video.play();
        else video.pause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const clickCorrect = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!trial || !videoRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point: Point = {
      x: ((event.clientX - rect.left) / rect.width) * videoRef.current.videoWidth,
      y: ((event.clientY - rect.top) / rect.height) * videoRef.current.videoHeight,
    };
    addCorrection(trial.id, {
      timestampSeconds: reviewTimestamp(),
      kind: mode === "body" ? "body-position" : "head-position",
      previousValue: mode === "body" ? sample?.body : sample?.head,
      correctedValue: point,
    });
  };

  if (!trial) {
    return (
      <section className="empty-state">
        <h2>Review</h2>
        <p className="help">Import a video first.</p>
      </section>
    );
  }
  if (!trial.tracking) {
    return (
      <section className="empty-state">
        <h2>Review</h2>
        <p className="help">Tracking has not been run for this trial.</p>
        <p className="help">Configure the arena, then start tracking.</p>
      </section>
    );
  }

  const provenance =
    sample?.source === "manual" ? "◆ Manual" : sample?.source === "interpolated" ? "○ Interpolated" : "● Automatic";
  const issueLabel = issues.length ? `Issue ${Math.min(issueIndex + 1, issues.length)} of ${issues.length}` : "No issues";

  return (
    <>
      <PageHeader title="Review">
        <p>
          Review {trial.source.fileName} · {issueLabel}
        </p>
      </PageHeader>
      <section className="card">
        <p className="help">
          Sample buttons jump between tracker observations. Frame buttons step the source video using its
          parsed timebase (not assumed 30 fps). Corrections use the inspected source timestamp. Automatic
          values are kept. Manual points use a square marker and a Manual label.
        </p>
        <div className="grid-2">
          <div>
            {url ? (
              <div className="canvas-wrap">
                <video
                  ref={videoRef}
                  src={url}
                  muted
                  playsInline
                  onTimeUpdate={(event) => {
                    const time = event.currentTarget.currentTime;
                    setReviewTime(time);
                    setIndex(nearestSampleIndex(samples, time));
                  }}
                />
                <canvas
                  ref={canvasRef}
                  className="overlay-canvas"
                  onClick={clickCorrect}
                  aria-label="Tracking overlay. Click to correct the selected point."
                />
              </div>
            ) : (
              <Banner kind="warn">Relink the video to see frames. Corrections can still be inspected from the timeline.</Banner>
            )}
            <div className="row" style={{ marginTop: "0.5rem" }}>
              <button type="button" className="btn-secondary" onClick={() => seekTo(index - 1)}>
                Previous sample
              </button>
              <button type="button" className="btn-secondary" onClick={() => seekTo(index + 1)}>
                Next sample
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={!frameDuration}
                onClick={() => stepSourceFrame(-1)}
              >
                Previous frame
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={!frameDuration}
                onClick={() => stepSourceFrame(1)}
              >
                Next frame
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  const video = videoRef.current;
                  if (!video) return;
                  if (video.paused) void video.play();
                  else video.pause();
                }}
              >
                Play / pause
              </button>
              <label>
                Jump to time (s)
                <input
                  type="number"
                  step="0.01"
                  onBlur={(event) => {
                    const time = Number(event.target.value);
                    if (Number.isFinite(time)) seekToTime(time);
                  }}
                />
              </label>
            </div>
            <p>
              {reviewTimestamp().toFixed(2)} s
              {trial.source.timebase ? ` · ${describeTimebase(trial.source.timebase)}` : ""}
              {frameDuration ? ` · frame step ${frameDuration.toFixed(5)} s` : ""}
            </p>
            <p>
              {sample?.source === "manual" ? "Manual body position" : "Automatic body position"}
              {" · "}
              <span className="provenance" data-kind={sample?.source ?? "automatic"} title={sample?.source === "manual" ? "Manual correction" : "Automatic observation"}>
                {provenance}
              </span>
              {" · Confidence: "}
              {sample ? (sample.confidence < 0.5 ? "Low" : sample.confidence < 0.8 ? "Moderate" : "High") : "—"}
              {" ("}
              {sample ? sample.confidence.toFixed(2) : "—"}
              {")"}
            </p>
            <p>
              nearest sample t = {sample?.timestampSeconds.toFixed(3) ?? "—"} s · {sample?.status ?? "—"} ·{" "}
              {sample?.source ?? "—"} · confidence {sample ? sample.confidence.toFixed(2) : "—"}
            </p>
            <h3>Correction tools</h3>
            <div className="row">
              <button type="button" className={mode === "body" ? "btn" : "btn-secondary"} onClick={() => setMode("body")}>
                Correct body
              </button>
              <button type="button" className={mode === "head" ? "btn" : "btn-secondary"} onClick={() => setMode("head")}>
                Correct head
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  addCorrection(trial.id, {
                    timestampSeconds: reviewTimestamp(),
                    kind: "tracking-failure",
                    previousValue: sample?.body,
                  })
                }
              >
                Mark not visible
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  addCorrection(trial.id, {
                    timestampSeconds: reviewTimestamp(),
                    kind: "hidden-in-hole",
                    previousValue: sample?.body,
                  })
                }
              >
                Mark hidden in hole
              </button>
              <button type="button" className="btn-ghost" onClick={() => undoLastCorrection(trial.id)}>
                Undo last correction
              </button>
            </div>
          </div>
          <div>
            <h3>{issues.length ? `Review ${issues.length} issues` : "No tracking issues require review"}</h3>
            {issues.length === 0 ? (
              <p className="help">You can still inspect the trajectory manually.</p>
            ) : null}
            <div className="row">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  const next = (issueIndex - 1 + issues.length) % Math.max(issues.length, 1);
                  setIssueIndex(next);
                  if (issues[next]) seekTo(nearestSampleIndex(samples, issues[next].startSeconds));
                }}
              >
                Previous issue
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  const next = (issueIndex + 1) % Math.max(issues.length, 1);
                  setIssueIndex(next);
                  if (issues[next]) seekTo(nearestSampleIndex(samples, issues[next].startSeconds));
                }}
              >
                Next issue
              </button>
            </div>
            <div className="issue-list">
              {issues.map((issue, i) => (
                <button
                  key={issue.id}
                  type="button"
                  className="issue"
                  aria-current={i === issueIndex}
                  onClick={() => {
                    setIssueIndex(i);
                    seekTo(nearestSampleIndex(samples, issue.startSeconds));
                  }}
                >
                  <strong>{issue.kind.replace("-", " ")}</strong>
                  <div className="help">{issue.summary}</div>
                </button>
              ))}
            </div>
            <h3>Events</h3>
            <ul>
              {trial.events.map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => seekToTime(event.startSeconds)}
                  >
                    {event.type} {event.holeIndex !== undefined ? `hole ${event.holeIndex + 1}` : ""} @ {event.startSeconds.toFixed(2)} s ({event.source})
                  </button>
                  {event.type === "escape-entry" && event.source === "automatic" ? (
                    <span className="row">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() =>
                          addCorrection(trial.id, {
                            timestampSeconds: event.startSeconds,
                            kind: "event-edit",
                            previousValue: event,
                            correctedValue: { ...event, source: "automatic-confirmed", confidence: 1 },
                          })
                        }
                      >
                        Confirm escape
                      </button>
                      <button
                        type="button"
                        className="btn-danger"
                        onClick={() =>
                          addCorrection(trial.id, {
                            timestampSeconds: event.startSeconds,
                            kind: "event-remove",
                            previousValue: event,
                            correctedValue: { id: event.id },
                          })
                        }
                      >
                        Reject escape
                      </button>
                    </span>
                  ) : null}
                  {event.type === "hole-investigation" || event.type === "target-investigation" ? (
                    <span className="row">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setEditEventId(event.id);
                          setEditHole((event.holeIndex ?? 0) + 1);
                          setEditStart(String(event.startSeconds));
                          setEditEnd(String(event.endSeconds ?? event.startSeconds));
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn-danger"
                        onClick={() =>
                          addCorrection(trial.id, {
                            timestampSeconds: event.startSeconds,
                            kind: "event-remove",
                            previousValue: event,
                            correctedValue: { id: event.id },
                          })
                        }
                      >
                        Reject
                      </button>
                    </span>
                  ) : null}
                  {editEventId === event.id ? (
                    <div className="row" style={{ marginTop: "0.35rem" }}>
                      <label>
                        Hole
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={editHole}
                          onChange={(change) => setEditHole(Number(change.target.value))}
                        />
                      </label>
                      <label>
                        Start (s)
                        <input value={editStart} onChange={(change) => setEditStart(change.target.value)} />
                      </label>
                      <label>
                        End (s)
                        <input value={editEnd} onChange={(change) => setEditEnd(change.target.value)} />
                      </label>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          const startSeconds = Number(editStart);
                          const endSeconds = Number(editEnd);
                          if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) return;
                          const holeIndex = Math.max(0, Math.min(19, editHole - 1));
                          const targetHole = trial.arena?.targetHoleIndex ?? 0;
                          const edited: BehavioralEvent = {
                            ...event,
                            holeIndex,
                            startSeconds,
                            endSeconds,
                            durationSeconds: Math.max(0, endSeconds - startSeconds),
                            type: investigationTypeForHole(holeIndex, targetHole),
                            source: event.source === "automatic" ? "automatic-confirmed" : "manual",
                            evidence: [...event.evidence, "manually edited investigation"],
                          };
                          addCorrection(trial.id, {
                            timestampSeconds: startSeconds,
                            kind: "event-edit",
                            previousValue: event,
                            correctedValue: edited,
                          });
                          setEditEventId(null);
                        }}
                      >
                        Save
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="row">
              <label>
                Hole
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={addHole}
                  onChange={(change) => setAddHole(Number(change.target.value))}
                />
              </label>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  const startSeconds = reviewTimestamp();
                  const holeIndex = Math.max(0, Math.min(19, addHole - 1));
                  const targetHole = trial.arena?.targetHoleIndex ?? 0;
                  addCorrection(trial.id, {
                    timestampSeconds: startSeconds,
                    kind: "event-add",
                    correctedValue: {
                      id: createId("evt"),
                      type: investigationTypeForHole(holeIndex, targetHole),
                      holeIndex,
                      startSeconds,
                      endSeconds: startSeconds,
                      durationSeconds: 0,
                      confidence: 1,
                      evidence: ["manually marked investigation"],
                      source: "manual",
                    },
                  });
                }}
              >
                Add investigation here
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  addCorrection(trial.id, {
                    timestampSeconds: reviewTimestamp(),
                    kind: "event-add",
                    correctedValue: {
                      id: createId("esc"),
                      type: "escape-entry",
                      holeIndex: trial.arena?.targetHoleIndex,
                      startSeconds: reviewTimestamp(),
                      confidence: 1,
                      evidence: ["manually marked escape entry"],
                      source: "manual",
                    },
                  })
                }
              >
                Mark escape entry here
              </button>
            </div>
          </div>
        </div>
        <QualityTimeline
          samples={samples}
          duration={trial.source.durationSeconds}
          onJump={(time) => seekToTime(time)}
        />
        <WorkspaceFooter note={issues.length ? `${issues.length} intervals need review` : "Review complete"}>
          <button type="button" className="btn-secondary" onClick={() => markReviewed(trial.id, "reviewed")}>
            Mark reviewed
          </button>
          <button type="button" className="btn" onClick={() => setStage("results")}>
            View Results →
          </button>
        </WorkspaceFooter>
      </section>
      <MethodPanel />
    </>
  );
}

function QualityTimeline({
  samples,
  duration,
  onJump,
}: {
  samples: Array<{ timestampSeconds: number; status: string; source: string }>;
  duration: number;
  onJump: (time: number) => void;
}) {
  return (
    <div>
      <h3>Quality timeline</h3>
      <div className="vis-legend">
        <span><i className="legend-swatch" style={{ background: "#1f4d5c" }} />Tracked</span>
        <span><i className="legend-swatch" style={{ background: "#c4a35a" }} />Low confidence</span>
        <span><i className="legend-swatch" style={{ background: "#6b2d2d" }} />Failed</span>
        <span><i className="legend-swatch" style={{ background: "#888" }} />Hidden</span>
        <span><i className="legend-swatch" style={{ background: "#3d2a78" }} />Manual</span>
        <span><i className="legend-swatch" style={{ background: "#fff", borderStyle: "dashed" }} />Interpolated</span>
      </div>
      <div
        className="timeline"
        role="slider"
        aria-label="Tracking quality over time"
        tabIndex={0}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          onJump(((event.clientX - rect.left) / rect.width) * duration);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") onJump(Math.min(duration, (samples[0]?.timestampSeconds ?? 0) + 0.5));
        }}
      >
        {samples.map((sample) => {
          const color =
            sample.source === "manual"
              ? "#3d2a78"
              : sample.source === "interpolated"
                ? "#ffffff"
                : sample.status === "tracked"
                  ? "#1f4d5c"
                  : sample.status === "low-confidence"
                    ? "#c4a35a"
                    : sample.status === "hidden"
                      ? "#888888"
                      : "#6b2d2d";
          return (
            <span
              key={`${sample.timestampSeconds}-${sample.status}-${sample.source}`}
              style={{
                position: "absolute",
                left: `${(sample.timestampSeconds / duration) * 100}%`,
                top: 0,
                bottom: 0,
                width: 2,
                background: color,
                border: sample.source === "interpolated" ? "1px dashed #111" : undefined,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
