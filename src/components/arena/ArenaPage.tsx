import { useEffect, useMemo, useRef, useState } from "react";
import {
  copyArena,
  createAssistedArena,
  distance,
  nudgePlatformCenter,
  rotateHoles,
  scaleHoleRing,
  transformArena,
} from "../../domain/geometry";
import { darkestLocalCenter, estimateBrightCircle, rgbaToGray } from "../../domain/image";
import type { ArenaGeometry, Point } from "../../domain/types";
import { currentTrialSelector, useSessionStore } from "../../state/sessionStore";
import { getVideoUrl } from "../../state/videoRegistry";
import { Banner, Field, PageHeader, WorkspaceFooter } from "../ui";

type SetupStep = "platform-center" | "platform-edge" | "first-hole" | "adjust";
type ArenaSelection = { kind: "platform" } | { kind: "hole"; index: number };

function drawArena(
  ctx: CanvasRenderingContext2D,
  arena: Partial<ArenaGeometry>,
  video: HTMLVideoElement,
  selection?: ArenaSelection,
) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  ctx.clearRect(0, 0, width, height);
  const sx = width / video.videoWidth;
  const sy = height / video.videoHeight;
  const platformSelected = selection?.kind === "platform";
  ctx.lineWidth = platformSelected ? 3.5 : 2;
  if (arena.platformCenterPx && arena.platformRadiusPx) {
    ctx.strokeStyle = platformSelected ? "#0b3a46" : "#1f4d5c";
    ctx.beginPath();
    ctx.arc(arena.platformCenterPx.x * sx, arena.platformCenterPx.y * sy, arena.platformRadiusPx * sx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = platformSelected ? "#0b3a46" : "#1f4d5c";
    ctx.beginPath();
    ctx.arc(arena.platformCenterPx.x * sx, arena.platformCenterPx.y * sy, platformSelected ? 6 : 4, 0, Math.PI * 2);
    ctx.fill();
  }
  arena.holeCentersPx?.forEach((hole, index) => {
    const isTarget = index === arena.targetHoleIndex;
    const isSelected = selection?.kind === "hole" && selection.index === index;
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.strokeStyle = isTarget ? "#6b2d2d" : "#3d2a78";
    ctx.setLineDash(isTarget || isSelected ? [] : [4, 3]);
    ctx.beginPath();
    ctx.arc(hole.x * sx, hole.y * sy, (arena.holeRadiusPx ?? 8) * sx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#111";
    ctx.font = "12px sans-serif";
    ctx.fillText(String(index + 1), hole.x * sx + 6, hole.y * sy - 6);
    if (isTarget) {
      ctx.fillText("TARGET", hole.x * sx + 6, hole.y * sy + 14);
    }
  });
}

function StepMark({ done }: { done: boolean }) {
  return (
    <span className="status-mark" aria-hidden="true">
      {done ? "✓" : "○"}
    </span>
  );
}

export function ArenaPage() {
  const session = useSessionStore((state) => state.session);
  const trial = currentTrialSelector(session);
  const setArena = useSessionStore((state) => state.setArena);
  const reuseArena = useSessionStore((state) => state.reuseArena);
  const setStage = useSessionStore((state) => state.setStage);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [step, setStep] = useState<SetupStep>(trial?.arena ? "adjust" : "platform-center");
  const [draftCenter, setDraftCenter] = useState<Point | undefined>(trial?.arena?.platformCenterPx);
  const [draftEdge, setDraftEdge] = useState<Point | undefined>();
  const [selection, setSelection] = useState<ArenaSelection>({
    kind: "hole",
    index: trial?.arena?.targetHoleIndex ?? 0,
  });
  const [nudge, setNudge] = useState(2);
  const url = trial ? getVideoUrl(trial.id) : undefined;
  const donor = session.trials.find((item) => item.id !== trial?.id && item.arena);

  const arena = trial?.arena;

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const sync = () => {
      canvas.width = video.clientWidth;
      canvas.height = video.clientHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const current: Partial<ArenaGeometry> = arena ?? {
        platformCenterPx: draftCenter,
        platformRadiusPx: draftCenter && draftEdge ? distance(draftCenter, draftEdge) : undefined,
      };
      drawArena(ctx, current, video, arena ? selection : undefined);
    };
    video.addEventListener("loadeddata", sync);
    window.addEventListener("resize", sync);
    sync();
    return () => {
      video.removeEventListener("loadeddata", sync);
      window.removeEventListener("resize", sync);
    };
  }, [arena, draftCenter, draftEdge, url, selection]);

  const toVideoPoint = (event: React.MouseEvent<HTMLCanvasElement>): Point | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * video.videoWidth,
      y: ((event.clientY - rect.top) / rect.height) * video.videoHeight,
    };
  };

  const onCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const point = toVideoPoint(event);
    if (!point || !trial) return;
    if (step === "platform-center") {
      setDraftCenter(point);
      setStep("platform-edge");
      return;
    }
    if (step === "platform-edge" && draftCenter) {
      setDraftEdge(point);
      setStep("first-hole");
      return;
    }
    if (step === "first-hole" && draftCenter && draftEdge) {
      const next = createAssistedArena({
        platformCenterPx: draftCenter,
        platformEdgePx: draftEdge,
        firstHolePx: point,
        targetHoleIndex: 0,
      });
      setArena(trial.id, next);
      setStep("adjust");
      return;
    }
    if (step === "adjust" && arena) {
      let nearest = 0;
      let best = Number.POSITIVE_INFINITY;
      arena.holeCentersPx.forEach((hole, index) => {
        const d = distance(hole, point);
        if (d < best) {
          best = d;
          nearest = index;
        }
      });
      const toCenter = distance(point, arena.platformCenterPx);
      const rimDistance = Math.abs(toCenter - arena.platformRadiusPx);
      const holeHit = best < Math.max(28, arena.holeRadiusPx + 8);
      const platformCenterHit = toCenter < 18;
      const platformRimHit = rimDistance < 14;
      if (holeHit && !platformCenterHit) {
        setSelection({ kind: "hole", index: nearest });
        return;
      }
      if (platformCenterHit || platformRimHit) {
        setSelection({ kind: "platform" });
        return;
      }
      if (holeHit) setSelection({ kind: "hole", index: nearest });
    }
  };

  const moveSelected = (dx: number, dy: number) => {
    if (!trial?.arena) return;
    if (selection.kind === "platform") {
      setArena(trial.id, nudgePlatformCenter(trial.arena, dx, dy));
      return;
    }
    const holes = trial.arena.holeCentersPx.map((hole, index) =>
      index === selection.index ? { x: hole.x + dx, y: hole.y + dy } : hole,
    );
    const sources = trial.arena.holeSources?.map((source, index) =>
      index === selection.index ? "manual" : source,
    );
    setArena(trial.id, { ...trial.arena, holeCentersPx: holes, holeSources: sources, geometrySource: "manual" });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (step !== "adjust") return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveSelected(0, -nudge);
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveSelected(0, nudge);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveSelected(-nudge, 0);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveSelected(nudge, 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const suggestPlatform = () => {
    const video = videoRef.current;
    if (!video || !trial) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const gray = rgbaToGray(image.data, canvas.width, canvas.height);
    const circle = estimateBrightCircle(gray);
    if (!circle) return;
    setDraftCenter({ x: circle.x, y: circle.y });
    setDraftEdge({ x: circle.x + circle.radius, y: circle.y });
    setStep("first-hole");
  };

  const refineHoles = () => {
    const video = videoRef.current;
    if (!video || !trial?.arena) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const gray = rgbaToGray(image.data, canvas.width, canvas.height);
    const holes = trial.arena.holeCentersPx.map((hole) => {
      const refined = darkestLocalCenter(gray, hole, 10, trial.arena!.holeRadiusPx);
      return { x: refined.x, y: refined.y };
    });
    setArena(trial.id, {
      ...trial.arena,
      holeCentersPx: holes,
      holeSources: holes.map(() => "refined"),
    });
  };

  const geometryNote = useMemo(() => {
    if (!arena) return null;
    if (arena.geometrySource === "reused" || arena.geometrySource === "registered") {
      return `Geometry ${arena.geometrySource} from a previous trial. Adjust if the overlay is off.`;
    }
    return `Geometry source: ${arena.geometrySource}.`;
  }, [arena]);

  if (!trial) {
    return (
      <section className="empty-state">
        <h2>Arena</h2>
        <p className="help">Import a video first.</p>
      </section>
    );
  }

  const centerDone = Boolean(arena || draftCenter);
  const edgeDone = Boolean(arena || draftEdge);
  const holeDone = Boolean(arena);
  const targetDone = Boolean(arena);
  const calibrated = typeof arena?.platformDiameterCm === "number" && arena.platformDiameterCm > 0;
  const ready = Boolean(arena);

  return (
    <>
      <PageHeader title="Arena">
        <p>Place the platform and holes on {trial.source.fileName}.</p>
      </PageHeader>
      <div className="grid-2">
        <section>
          <h3>Arena preview</h3>
          <p className="help">
            {step === "platform-center" && "Click the platform center."}
            {step === "platform-edge" && "Click a point on the platform edge."}
            {step === "first-hole" && "Click the center of one clearly visible hole. The other 19 are generated at 18°."}
            {step === "adjust" &&
              "Click the platform circle or a hole, then nudge with buttons or arrow keys."}
          </p>
          {url ? (
            <div className="canvas-wrap">
              <video ref={videoRef} src={url} muted playsInline />
              <canvas
                ref={canvasRef}
                className="overlay-canvas"
                onClick={onCanvasClick}
                role="img"
                aria-label="Arena overlay. Click to place platform or holes. Arrow keys nudge the selected platform or hole."
              />
            </div>
          ) : (
            <Banner kind="warn">
              Relink {trial.source.fileName} to see the video. Saved geometry can still be edited from numbers.
            </Banner>
          )}
          <p className="micro" style={{ marginTop: 8 }}>
            Click to place · Arrow keys for precision
          </p>
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" className="btn-secondary" onClick={suggestPlatform}>
              Suggest platform
            </button>
            {arena ? (
              <button type="button" className="btn-secondary" onClick={refineHoles}>
                Refine holes locally
              </button>
            ) : null}
          </div>
        </section>
        <section className="panel">
          <h3>Arena setup</h3>
          {geometryNote ? <p className="help">{geometryNote}</p> : null}
          <ol className="setup-list">
            <li>
              <StepMark done={centerDone} /> Platform center
            </li>
            <li>
              <StepMark done={edgeDone} /> Platform edge
            </li>
            <li>
              <StepMark done={holeDone} /> First hole
            </li>
            <li>
              <StepMark done={targetDone} /> Target hole
            </li>
            <li>
              <StepMark done={calibrated} /> Physical scale
            </li>
          </ol>

          {donor && trial && !arena ? (
            <Banner kind="info">
              Reuse the arena from {donor.source.fileName}.
              <div className="row" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    reuseArena(donor.id, trial.id, copyArena(donor.arena!, "reused"));
                    setStep("adjust");
                  }}
                >
                  Reuse this arena layout
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    const video = videoRef.current;
                    if (!video || !donor.arena) return;
                    const canvas = document.createElement("canvas");
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    const ctx = canvas.getContext("2d");
                    if (!ctx) return;
                    ctx.drawImage(video, 0, 0);
                    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const gray = rgbaToGray(image.data, canvas.width, canvas.height);
                    const circle = estimateBrightCircle(gray);
                    if (!circle) {
                      reuseArena(donor.id, trial.id, copyArena(donor.arena, "reused"));
                      setStep("adjust");
                      return;
                    }
                    const scale = circle.radius / donor.arena.platformRadiusPx;
                    const registered = transformArena(donor.arena, {
                      translationX: circle.x - donor.arena.platformCenterPx.x,
                      translationY: circle.y - donor.arena.platformCenterPx.y,
                      scale,
                      rotationRadians: 0,
                    });
                    reuseArena(donor.id, trial.id, { ...registered, geometrySource: "registered" });
                    setStep("adjust");
                  }}
                >
                  Align to this video
                </button>
              </div>
            </Banner>
          ) : null}

          {arena ? (
            <>
              <p className="help" style={{ marginTop: 12 }}>
                {calibrated
                  ? `Arena calibrated · ${arena.holeCentersPx.length} holes · Target: Hole ${arena.targetHoleIndex + 1} · ${arena.platformDiameterCm} cm platform`
                  : `Geometry ready · ${arena.holeCentersPx.length} holes generated · Target: Hole ${arena.targetHoleIndex + 1}. Physical scale required for distance and speed.`}
              </p>
              <Field label="Target hole" hint="Do not infer the target from disappearance. Choose it here.">
                <select
                  value={arena.targetHoleIndex}
                  onChange={(event) =>
                    setArena(trial.id, { ...arena, targetHoleIndex: Number(event.target.value) })
                  }
                >
                  {arena.holeCentersPx.map((_, index) => (
                    <option key={index} value={index}>
                      Hole {index + 1}
                      {index === arena.targetHoleIndex ? " (target)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Platform diameter (cm)"
                hint="Required for path length and speed in centimeters. Not assumed from the literature."
              >
                <input
                  type="number"
                  min={1}
                  step="0.1"
                  value={arena.platformDiameterCm ?? ""}
                  onChange={(event) =>
                    setArena(trial.id, {
                      ...arena,
                      platformDiameterCm: event.target.value === "" ? undefined : Number(event.target.value),
                    })
                  }
                />
              </Field>
              <details className="advanced">
                <summary>Adjustments</summary>
                <Field label="Hole radius (px)">
                  <input
                    type="number"
                    min={2}
                    value={arena.holeRadiusPx}
                    onChange={(event) => setArena(trial.id, { ...arena, holeRadiusPx: Number(event.target.value) })}
                  />
                </Field>
                <Field label="Platform radius (px)">
                  <input
                    type="number"
                    min={10}
                    value={Math.round(arena.platformRadiusPx)}
                    onChange={(event) => setArena(trial.id, { ...arena, platformRadiusPx: Number(event.target.value) })}
                  />
                </Field>
                <div className="row">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      setArena(trial.id, { ...arena, holeCentersPx: rotateHoles(arena, (2 * Math.PI) / 180) })
                    }
                  >
                    Rotate ring +1°
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      setArena(trial.id, { ...arena, holeCentersPx: rotateHoles(arena, -(2 * Math.PI) / 180) })
                    }
                  >
                    Rotate ring −1°
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setArena(trial.id, { ...arena, holeCentersPx: scaleHoleRing(arena, 1.01) })}
                  >
                    Scale ring +
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setArena(trial.id, { ...arena, holeCentersPx: scaleHoleRing(arena, 0.99) })}
                  >
                    Scale ring −
                  </button>
                </div>
                <h3>
                  {selection.kind === "platform"
                    ? "Selected platform"
                    : `Selected hole ${selection.index + 1}`}
                </h3>
                <div className="row">
                  <button
                    type="button"
                    className={selection.kind === "platform" ? "btn" : "btn-secondary"}
                    onClick={() => setSelection({ kind: "platform" })}
                  >
                    Select platform
                  </button>
                </div>
                <Field label="Nudge step (px)">
                  <input type="number" value={nudge} min={1} onChange={(event) => setNudge(Number(event.target.value))} />
                </Field>
                <div className="row">
                  <button type="button" className="btn-secondary" onClick={() => moveSelected(0, -nudge)}>
                    Up
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => moveSelected(-nudge, 0)}>
                    Left
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => moveSelected(nudge, 0)}>
                    Right
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => moveSelected(0, nudge)}>
                    Down
                  </button>
                </div>
                <p className="help">
                  Arrow keys also nudge the selected {selection.kind === "platform" ? "platform circle" : "hole"}.
                  {selection.kind === "platform"
                    ? " This slides the platform overlay; holes stay where they are. Use Platform radius to grow or shrink the rim."
                    : ""}{" "}
                  Hole sources:{" "}
                  {arena.holeSources?.filter((item) => item === "predicted").length ?? 0} predicted,{" "}
                  {arena.holeSources?.filter((item) => item === "refined").length ?? 0} refined,{" "}
                  {arena.holeSources?.filter((item) => item === "manual").length ?? 0} manual.
                </p>
              </details>
            </>
          ) : (
            <p className="help">Place the platform and one hole, or reuse a previous layout.</p>
          )}
        </section>
      </div>
      <WorkspaceFooter note={ready ? "Arena configured" : "Finish arena setup to continue"}>
        <button type="button" className="btn" disabled={!ready} onClick={() => setStage("track")}>
          Continue to Track →
        </button>
      </WorkspaceFooter>
    </>
  );
}
