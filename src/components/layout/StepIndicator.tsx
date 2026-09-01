import { useSessionStore } from "../../state/sessionStore";
import type { WorkflowStage } from "../../domain/types";

const STEPS: Array<{ id: WorkflowStage; label: string }> = [
  { id: "videos", label: "Videos" },
  { id: "arena", label: "Arena" },
  { id: "track", label: "Track" },
  { id: "review", label: "Review" },
  { id: "results", label: "Results" },
];

export function StepIndicator() {
  const session = useSessionStore((state) => state.session);
  const setStage = useSessionStore((state) => state.setStage);
  const stage = session.currentStage;
  const trials = session.trials;
  const complete = {
    videos: trials.length > 0,
    arena: trials.some((trial) => trial.arena),
    track: trials.some((trial) => trial.tracking),
    review: trials.some((trial) => trial.reviewStatus === "reviewed" || trial.reviewStatus === "complete"),
    results: trials.some((trial) => trial.metrics),
  };

  return (
    <nav className="steps" aria-label="Analysis workflow">
      {STEPS.map((step, index) => {
        const state = stage === step.id ? "current" : complete[step.id] ? "complete" : "upcoming";
        const mark = state === "complete" ? "✓" : state === "current" ? "●" : "○";
        const locked =
          (step.id === "arena" && trials.length === 0) ||
          (step.id === "track" && !complete.arena) ||
          (step.id === "review" && !complete.track) ||
          (step.id === "results" && !complete.track);
        return (
          <span key={step.id} style={{ display: "inline-flex", alignItems: "center" }}>
            {index > 0 ? <span className="step-rail" aria-hidden="true" /> : null}
            <button
              type="button"
              className="step"
              data-state={state}
              aria-current={stage === step.id ? "step" : undefined}
              disabled={locked && state !== "current"}
              onClick={() => setStage(step.id)}
            >
              <span className="step-mark" aria-hidden="true">
                {mark}
              </span>
              {step.label}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
