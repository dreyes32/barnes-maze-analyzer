import type { AnalysisParameters } from "./types";

export const DEFAULT_PARAMETERS: AnalysisParameters = {
  sampling: {
    targetObservationsPerSecond: 12,
  },
  tracking: {
    backgroundFrameCount: 24,
    foregroundThreshold: "auto",
    morphologyRadiusPx: 2,
    platformMarginPx: 18,
  },
  cleanup: {
    gapFill: "short",
    maxGapSeconds: 0.25,
    smoothing: "none",
    smoothingWindow: 5,
    outlierRule: "robust-speed",
    outlierMultiplier: 6,
  },
  events: {
    investigationRadiusCm: 3.5,
    fallbackInvestigationRadiusPx: 18,
    minInvestigationSeconds: 0.2,
    separationSeconds: 0.4,
    hysteresisFactor: 1.3,
    escapeDisappearanceSeconds: 0.8,
    escapeProximityCm: 5,
  },
  strategy: {
    spatialMaxPrimaryErrors: 2,
    spatialMinPathEfficiency: 0.45,
    serialMinAdjacencyRatio: 0.55,
    serialMinInvestigations: 4,
    serialMinPerimeterOccupancy: 0.55,
  },
};

export function cloneParameters(parameters: AnalysisParameters): AnalysisParameters {
  return structuredClone(parameters);
}
