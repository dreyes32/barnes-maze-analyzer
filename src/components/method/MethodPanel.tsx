import { useSessionStore } from "../../state/sessionStore";
import { Field } from "../ui";
import { Banner } from "../ui";

export function MethodPanel() {
  const parameters = useSessionStore((state) => state.session.parameters);
  const updateParameters = useSessionStore((state) => state.updateParameters);
  const impact = useSessionStore((state) => state.lastImpactText);

  return (
    <section className="card">
      <h2>Method / Analysis settings</h2>
      <p className="help">
        These definitions are the ones used for events, cleanup, and strategy. Changing a value recomputes
        everything downstream and keeps raw automatic tracking.
      </p>
      {impact ? <Banner kind="info">{impact}</Banner> : null}
      <div className="method-grid">
        <Field label="Analysis sampling (observations / s)">
          <input
            type="number"
            min={1}
            max={30}
            value={parameters.sampling.targetObservationsPerSecond}
            onChange={(event) =>
              updateParameters(
                (current) => ({
                  ...current,
                  sampling: { targetObservationsPerSecond: Number(event.target.value) },
                }),
                { path: "analysis sampling", before: String(parameters.sampling.targetObservationsPerSecond), after: event.target.value },
              )
            }
          />
        </Field>
        <Field label="Gap fill">
          <select
            value={parameters.cleanup.gapFill}
            onChange={(event) =>
              updateParameters(
                (current) => ({
                  ...current,
                  cleanup: { ...current.cleanup, gapFill: event.target.value as "none" | "short" },
                }),
                { path: "gap fill", before: parameters.cleanup.gapFill, after: event.target.value },
              )
            }
          >
            <option value="none">None</option>
            <option value="short">Short gaps only</option>
          </select>
        </Field>
        <Field label="Interpolate gaps ≤ (s)">
          <input
            type="number"
            step="0.05"
            value={parameters.cleanup.maxGapSeconds}
            onChange={(event) =>
              updateParameters(
                (current) => ({
                  ...current,
                  cleanup: { ...current.cleanup, maxGapSeconds: Number(event.target.value) },
                }),
                { path: "maximum gap", before: String(parameters.cleanup.maxGapSeconds), after: event.target.value },
              )
            }
          />
        </Field>
        <Field label="Smoothing">
          <select
            value={parameters.cleanup.smoothing}
            onChange={(event) =>
              updateParameters(
                (current) => ({
                  ...current,
                  cleanup: { ...current.cleanup, smoothing: event.target.value as "none" | "moving-median" },
                }),
                { path: "smoothing", before: parameters.cleanup.smoothing, after: event.target.value },
              )
            }
          >
            <option value="none">Disabled</option>
            <option value="moving-median">Moving median</option>
          </select>
        </Field>
        <Field label="Smoothing window">
          <input
            type="number"
            min={3}
            step={2}
            value={parameters.cleanup.smoothingWindow}
            onChange={(event) =>
              updateParameters(
                (current) => ({
                  ...current,
                  cleanup: { ...current.cleanup, smoothingWindow: Number(event.target.value) },
                }),
                { path: "smoothing window", before: String(parameters.cleanup.smoothingWindow), after: event.target.value },
              )
            }
          />
        </Field>
        <Field label="Investigation radius (cm)">
          <input
            type="number"
            step="0.1"
            value={parameters.events.investigationRadiusCm}
            onChange={(event) =>
              updateParameters(
                (current) => ({
                  ...current,
                  events: { ...current.events, investigationRadiusCm: Number(event.target.value) },
                }),
                { path: "investigation radius", before: String(parameters.events.investigationRadiusCm), after: event.target.value },
              )
            }
          />
        </Field>
        <Field label="Minimum investigation (s)">
          <input
            type="number"
            step="0.05"
            value={parameters.events.minInvestigationSeconds}
            onChange={(event) =>
              updateParameters(
                (current) => ({
                  ...current,
                  events: { ...current.events, minInvestigationSeconds: Number(event.target.value) },
                }),
                { path: "minimum investigation duration", before: String(parameters.events.minInvestigationSeconds), after: event.target.value },
              )
            }
          />
        </Field>
        <Field label="Visit separation (s)">
          <input
            type="number"
            step="0.05"
            value={parameters.events.separationSeconds}
            onChange={(event) =>
              updateParameters(
                (current) => ({
                  ...current,
                  events: { ...current.events, separationSeconds: Number(event.target.value) },
                }),
                { path: "visit separation", before: String(parameters.events.separationSeconds), after: event.target.value },
              )
            }
          />
        </Field>
        <Field label="Hysteresis factor">
          <input
            type="number"
            step="0.05"
            value={parameters.events.hysteresisFactor}
            onChange={(event) =>
              updateParameters(
                (current) => ({
                  ...current,
                  events: { ...current.events, hysteresisFactor: Number(event.target.value) },
                }),
                { path: "hysteresis factor", before: String(parameters.events.hysteresisFactor), after: event.target.value },
              )
            }
          />
        </Field>
        <Field label="Escape disappearance (s)">
          <input
            type="number"
            step="0.05"
            value={parameters.events.escapeDisappearanceSeconds}
            onChange={(event) =>
              updateParameters(
                (current) => ({
                  ...current,
                  events: { ...current.events, escapeDisappearanceSeconds: Number(event.target.value) },
                }),
                { path: "escape disappearance duration", before: String(parameters.events.escapeDisappearanceSeconds), after: event.target.value },
              )
            }
          />
        </Field>
      </div>
      <details className="advanced">
        <summary>Advanced tracking and strategy thresholds</summary>
        <div className="method-grid">
          <Field label="Foreground threshold">
            <input
              value={parameters.tracking.foregroundThreshold}
              onChange={(event) =>
                updateParameters(
                  (current) => ({
                    ...current,
                    tracking: {
                      ...current.tracking,
                      foregroundThreshold: event.target.value === "auto" ? "auto" : Number(event.target.value),
                    },
                  }),
                  { path: "foreground threshold", before: String(parameters.tracking.foregroundThreshold), after: event.target.value },
                )
              }
            />
          </Field>
          <Field label="Outlier multiplier">
            <input
              type="number"
              value={parameters.cleanup.outlierMultiplier}
              onChange={(event) =>
                updateParameters(
                  (current) => ({
                    ...current,
                    cleanup: { ...current.cleanup, outlierMultiplier: Number(event.target.value) },
                  }),
                  { path: "outlier multiplier", before: String(parameters.cleanup.outlierMultiplier), after: event.target.value },
                )
              }
            />
          </Field>
          <Field label="Spatial max primary errors">
            <input
              type="number"
              value={parameters.strategy.spatialMaxPrimaryErrors}
              onChange={(event) =>
                updateParameters(
                  (current) => ({
                    ...current,
                    strategy: { ...current.strategy, spatialMaxPrimaryErrors: Number(event.target.value) },
                  }),
                  { path: "spatial max primary errors", before: String(parameters.strategy.spatialMaxPrimaryErrors), after: event.target.value },
                )
              }
            />
          </Field>
          <Field label="Serial min adjacency">
            <input
              type="number"
              step="0.05"
              value={parameters.strategy.serialMinAdjacencyRatio}
              onChange={(event) =>
                updateParameters(
                  (current) => ({
                    ...current,
                    strategy: { ...current.strategy, serialMinAdjacencyRatio: Number(event.target.value) },
                  }),
                  { path: "serial adjacency", before: String(parameters.strategy.serialMinAdjacencyRatio), after: event.target.value },
                )
              }
            />
          </Field>
        </div>
      </details>
    </section>
  );
}
