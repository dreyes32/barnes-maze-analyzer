import { recomputeSession } from "../domain/pipeline";
import type { AnalysisSession } from "../domain/types";
import { buildExampleSession } from "./buildExampleSession";

export function loadDemoSession(): AnalysisSession {
  return recomputeSession({
    ...buildExampleSession(),
    isDemo: true,
    demoLabel: "Example analysis",
    currentStage: "results",
  });
}
