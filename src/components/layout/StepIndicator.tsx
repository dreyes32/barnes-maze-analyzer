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
  const stage = useSessionStore((state) => state.session.currentStage);
  const setStage = useSessionStore((state) => state.setStage);

  return (
    <nav className="steps" aria-label="Analysis workflow">
      {STEPS.map((step, index) => (
        <button
          key={step.id}
          type="button"
          className="step"
          aria-current={stage === step.id ? "step" : undefined}
          onClick={() => setStage(step.id)}
        >
          <span className="step-index">{index + 1}</span>
          {step.label}
        </button>
      ))}
    </nav>
  );
}
