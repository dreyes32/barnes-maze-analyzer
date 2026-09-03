import { useEffect, useMemo, useRef, useState } from "react";
import { investigationTypeForHole } from "../../domain/events";
import { createId } from "../../domain/ids";
import { buildReviewIssues } from "../../domain/qc";
import { describeTimebase, sourceFrameDurationSeconds } from "../../domain/timebase";
import type { BehavioralEvent, Point, ReviewIssueKind } from "../../domain/types";
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
  const [sideTab, setSideTab] = useState<"issues" | "events">("issues");
  const [eventFilter, setEventFilter] = useState<"all" | "target" | "nontarget" | "manual">("all");
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

  const issueLabel = issues.length ? `Issue ${Math.min(issueIndex + 1, issues.length)} of ${issues.length}` : "No issues";
  const currentIssue = issues[issueIndex];
  const now = reviewTimestamp();
  const nearbyEvents = trial.events.filter((event) => Math.abs(event.startSeconds - now) <= 2);
  const filteredEvents = trial.events.filter((event) => {
    if (eventFilter === "target") return event.type === "target-investigation" || event.type === "escape-entry";
    if (eventFilter === "nontarget") return event.type === "hole-investigation";
    if (eventFilter === "manual") return event.source === "manual";
    return true;
  });

  return (
    <>
      <PageHeader title="Review">
        <p>
          Review {trial.source.fileName} · {issueLabel}
        </p>
      </PageHeader>
      <section className="card">
        <p className="help">
          Tracking uses sampled observations. Frame controls inspect the source video precisely.
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
            <div className="review-nav">
              <div className="review-nav-group">
                <span className="micro">Sample</span>
                <div className="row">
                  <button type="button" className="btn-secondary" title="Jump to previous analyzed observation" onClick={() => seekTo(index - 1)}>
                    Previous sample
                  </button>
                  <button type="button" className="btn-secondary" title="Jump to next analyzed observation" onClick={() => seekTo(index + 1)}>
                    Next sample
                  </button>
                </div>
              </div>
              <div className="review-nav-group">
                <span className="micro">Frame</span>
                <div className="row">
                  <button
                    type="button"
                    className="btn-secondary"
                    title="Step one source video frame earlier"
                    disabled={!frameDuration}
                    onClick={() => stepSourceFrame(-1)}
                  >
                    Previous frame
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    title="Step one source video frame later"
                    disabled={!frameDuration}
                    onClick={() => stepSourceFrame(1)}
                  >
                    Next frame
                  </button>
                </div>
              </div>
              <div className="review-nav-group">
                <span className="micro">Playback</span>
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
              </div>
              <div className="review-nav-group">
                <span className="micro">Time</span>
                <div className="row">
                  <label>
                    Jump to time (s)
                    <input
                      type="number"
                      step="0.01"
                      onBlur={(event) => {
                        const time = Number(event.target.value);
                        if (Number.isFinite(time)) seekToTime(time);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        const time = Number((event.target as HTMLInputElement).value);
                        if (Number.isFinite(time)) seekToTime(time);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={(event) => {
                      const input = (event.currentTarget.parentElement?.querySelector("input") as HTMLInputElement | null);
                      const time = Number(input?.value);
                      if (Number.isFinite(time)) seekToTime(time);
                    }}
                  >
                    Go
                  </button>
                </div>
              </div>
            </div>
            <p>
              {reviewTimestamp().toFixed(2)} s
              {trial.source.timebase ? ` · ${describeTimebase(trial.source.timebase)}` : ""}
              {frameDuration ? ` · frame step ${frameDuration.toFixed(5)} s` : ""}
            </p>
            <p>
              {sample?.source === "manual" ? "Manual body position" : "Automatic body position"}
              {" · "}
              <span className="provenance" data-kind={sample?.source ?? "automatic"}>
                {sample?.source === "manual" ? "◆ Manual" : sample?.source === "interpolated" ? "⋯ Interpolated" : sample?.status === "failed" ? "× Failed" : "● Automatic"}
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
            <div className="tablist" role="tablist" aria-label="Review lists">
              <button
                type="button"
                role="tab"
                aria-selected={sideTab === "issues"}
                id="review-tab-issues"
                aria-controls="review-panel-issues"
                onClick={() => setSideTab("issues")}
              >
                Issues {issues.length}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sideTab === "events"}
                id="review-tab-events"
                aria-controls="review-panel-events"
                onClick={() => setSideTab("events")}
              >
                Events {trial.events.length}
              </button>
            </div>
            {sideTab === "issues" ? (
            <div role="tabpanel" id="review-panel-issues" aria-labelledby="review-tab-issues">
            <h3>{issues.length ? `Issue ${Math.min(issueIndex + 1, issues.length)} of ${issues.length}` : "No tracking issues require review"}</h3>
            {issues.length === 0 ? (
              <p className="help">You can still inspect the trajectory manually.</p>
            ) : currentIssue ? (
              <article className="panel" style={{ marginBottom: 12 }}>
                <strong>{currentIssue.kind.replace(/-/g, " ")}</strong>
                <p className="help">
                  {currentIssue.startSeconds.toFixed(1)}–{currentIssue.endSeconds.toFixed(1)} s
                </p>
                <p>{currentIssue.summary}</p>
                <p className="help">{issueGuidance(currentIssue.kind)}</p>
              </article>
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
                  <strong>{issue.kind.replace(/-/g, " ")}</strong>
                  <div className="help">
                    {issue.startSeconds.toFixed(1)}–{issue.endSeconds.toFixed(1)} s · {issue.summary}
                    {issue.kind === "manual-correction" ? " · ◆ Manual" : ""}
                  </div>
                </button>
              ))}
            </div>
            </div>
            ) : (
            <div role="tabpanel" id="review-panel-events" aria-labelledby="review-tab-events">
            <div className="row" style={{ marginBottom: 8 }}>
              {(["all", "target", "nontarget", "manual"] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={eventFilter === filter ? "btn" : "btn-ghost"}
                  onClick={() => setEventFilter(filter)}
                >
                  {filter === "all" ? "All events" : filter === "nontarget" ? "Non-target" : filter === "target" ? "Target" : "Manual"}
                </button>
              ))}
            </div>
            <h3>Events near {now.toFixed(2)} s</h3>
            {nearbyEvents.length === 0 ? <p className="help">No events within 2 s of the current time.</p> : null}
            <ul className="event-list">
              {nearbyEvents.map((event) => (
                <EventRow
                  key={`near-${event.id}`}
                  event={event}
                  trialId={trial.id}
                  targetHole={trial.arena?.targetHoleIndex ?? 0}
                  editEventId={editEventId}
                  editHole={editHole}
                  editStart={editStart}
                  editEnd={editEnd}
                  setEditEventId={setEditEventId}
                  setEditHole={setEditHole}
                  setEditStart={setEditStart}
                  setEditEnd={setEditEnd}
                  addCorrection={addCorrection}
                  seekToTime={seekToTime}
                />
              ))}
            </ul>
            <h3>All events</h3>
            <ul className="issue-list event-list">
              {filteredEvents.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  trialId={trial.id}
                  targetHole={trial.arena?.targetHoleIndex ?? 0}
                  editEventId={editEventId}
                  editHole={editHole}
                  editStart={editStart}
                  editEnd={editEnd}
                  setEditEventId={setEditEventId}
                  setEditHole={setEditHole}
                  setEditStart={setEditStart}
                  setEditEnd={setEditEnd}
                  addCorrection={addCorrection}
                  seekToTime={seekToTime}
                />
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
            )}
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

function issueGuidance(kind: ReviewIssueKind): string {
  switch (kind) {
    case "missing-interval":
      return "Mouse was not detected during this interval. Review whether this represents tracking loss or a behavioral event.";
    case "low-confidence":
      return "The tracker assigned a position with low confidence. Confirm the marker is on the animal.";
    case "manual-correction":
      return "A manual correction is recorded at this time.";
    case "possible-escape":
      return "Possible escape entry — confirm or reject in the Events tab.";
    case "ambiguous-investigation":
      return "This hole investigation is low-confidence. Confirm, edit, or reject it.";
    case "large-jump":
      return "The tracked position jumped farther than expected. Check whether the marker left the animal.";
    default:
      return "";
  }
}

function EventRow({
  event,
  trialId,
  targetHole,
  editEventId,
  editHole,
  editStart,
  editEnd,
  setEditEventId,
  setEditHole,
  setEditStart,
  setEditEnd,
  addCorrection,
  seekToTime,
}: {
  event: BehavioralEvent;
  trialId: string;
  targetHole: number;
  editEventId: string | null;
  editHole: number;
  editStart: string;
  editEnd: string;
  setEditEventId: (id: string | null) => void;
  setEditHole: (value: number) => void;
  setEditStart: (value: string) => void;
  setEditEnd: (value: string) => void;
  addCorrection: (trialId: string, correction: Omit<import("../../domain/types").CorrectionRecord, "id" | "createdAt">) => void;
  seekToTime: (time: number) => void;
}) {
  const hole = event.holeIndex !== undefined ? `Hole ${event.holeIndex + 1}` : "Event";
  const kind =
    event.type === "target-investigation"
      ? "target investigation"
      : event.type === "escape-entry"
        ? "escape entry"
        : "investigation";
  return (
    <li>
      <button type="button" className="btn-ghost" onClick={() => seekToTime(event.startSeconds)}>
        {hole} {kind}
        <div className="help">
          {event.startSeconds.toFixed(2)}
          {event.endSeconds !== undefined ? `–${event.endSeconds.toFixed(2)}` : ""} s · {event.source === "manual" ? "◆ Manual" : "● Automatic"}
        </div>
      </button>
      {event.type === "escape-entry" && event.source === "automatic" ? (
        <span className="row">
          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              addCorrection(trialId, {
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
              addCorrection(trialId, {
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
              addCorrection(trialId, {
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
            <input type="number" min={1} max={20} value={editHole} onChange={(change) => setEditHole(Number(change.target.value))} />
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
              addCorrection(trialId, {
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
        <span>● Automatic</span>
        <span>◆ Manual</span>
        <span>⋯ Interpolated</span>
        <span>× Failed</span>
        <span>Hidden</span>
        <span>Low confidence</span>
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
