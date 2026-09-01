import { methodNumberSchemas } from "../../domain/parameterValues";
import { isTrackingStale } from "../../domain/trackingProvenance";
import { useSessionStore } from "../../state/sessionStore";
import { Banner, Field } from "../ui";
import { ValidatedNumberInput } from "./ValidatedNumberInput";

export function MethodPanel() {
  const parameters = useSessionStore((state) => state.session.parameters);
  const trials = useSessionStore((state) => state.session.trials);
  const updateParameters = useSessionStore((state) => state.updateParameters);
  const impact = useSessionStore((state) => state.lastImpactText);
  const stale = trials.some((trial) => isTrackingStale(trial.tracking));

  const gap =
    parameters.cleanup.gapFill === "none"
      ? "no gap fill"
      : `short gaps ≤ ${parameters.cleanup.maxGapSeconds} s`;
  const smoothing = parameters.cleanup.smoothing === "none" ? "no smoothing" : parameters.cleanup.smoothing;

  return (
    <details className="method-settings">
      <summary>
        <strong>Method / Analysis settings</strong>
        <span className="help">
          {parameters.sampling.targetObservationsPerSecond} observations/s · {gap} · {smoothing} ·{" "}
          {parameters.events.investigationRadiusCm} cm investigation radius
        </span>
      </summary>
      <p className="help">
        Cleanup, event, and strategy values recompute from existing tracking. Sampling and tracking
        settings are applied only when you re-run tracking.
      </p>
      {stale ? (
        <Banner kind="warn">Tracking settings changed. Re-run tracking to apply them.</Banner>
      ) : null}
      {impact ? <Banner kind="info">{impact}</Banner> : null}
      <div className="method-grid">
        <Field label="Analysis sampling (observations / s)">
          <ValidatedNumberInput
            type="number"
            min={1}
            max={30}
            value={parameters.sampling.targetObservationsPerSecond}
            schema={methodNumberSchemas.targetObservationsPerSecond}
            onCommit={(value) =>
              updateParameters(
                (current) => ({
                  ...current,
                  sampling: { targetObservationsPerSecond: value as number },
                }),
                {
                  path: "analysis sampling",
                  before: String(parameters.sampling.targetObservationsPerSecond),
                  after: String(value),
                },
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
          <ValidatedNumberInput
            type="number"
            step="0.05"
            value={parameters.cleanup.maxGapSeconds}
            schema={methodNumberSchemas.maxGapSeconds}
            onCommit={(value) =>
              updateParameters(
                (current) => ({
                  ...current,
                  cleanup: { ...current.cleanup, maxGapSeconds: value as number },
                }),
                { path: "maximum gap", before: String(parameters.cleanup.maxGapSeconds), after: String(value) },
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
          <ValidatedNumberInput
            type="number"
            min={3}
            step={2}
            value={parameters.cleanup.smoothingWindow}
            schema={methodNumberSchemas.smoothingWindow}
            onCommit={(value) =>
              updateParameters(
                (current) => ({
                  ...current,
                  cleanup: { ...current.cleanup, smoothingWindow: value as number },
                }),
                {
                  path: "smoothing window",
                  before: String(parameters.cleanup.smoothingWindow),
                  after: String(value),
                },
              )
            }
          />
        </Field>
        <Field label="Investigation radius (cm)">
          <ValidatedNumberInput
            type="number"
            step="0.1"
            value={parameters.events.investigationRadiusCm}
            schema={methodNumberSchemas.investigationRadiusCm}
            onCommit={(value) =>
              updateParameters(
                (current) => ({
                  ...current,
                  events: { ...current.events, investigationRadiusCm: value as number },
                }),
                {
                  path: "investigation radius",
                  before: String(parameters.events.investigationRadiusCm),
                  after: String(value),
                },
              )
            }
          />
        </Field>
        <Field label="Minimum investigation (s)">
          <ValidatedNumberInput
            type="number"
            step="0.05"
            value={parameters.events.minInvestigationSeconds}
            schema={methodNumberSchemas.minInvestigationSeconds}
            onCommit={(value) =>
              updateParameters(
                (current) => ({
                  ...current,
                  events: { ...current.events, minInvestigationSeconds: value as number },
                }),
                {
                  path: "minimum investigation duration",
                  before: String(parameters.events.minInvestigationSeconds),
                  after: String(value),
                },
              )
            }
          />
        </Field>
        <Field label="Visit separation (s)">
          <ValidatedNumberInput
            type="number"
            step="0.05"
            value={parameters.events.separationSeconds}
            schema={methodNumberSchemas.separationSeconds}
            onCommit={(value) =>
              updateParameters(
                (current) => ({
                  ...current,
                  events: { ...current.events, separationSeconds: value as number },
                }),
                {
                  path: "visit separation",
                  before: String(parameters.events.separationSeconds),
                  after: String(value),
                },
              )
            }
          />
        </Field>
        <Field label="Hysteresis factor">
          <ValidatedNumberInput
            type="number"
            step="0.05"
            value={parameters.events.hysteresisFactor}
            schema={methodNumberSchemas.hysteresisFactor}
            onCommit={(value) =>
              updateParameters(
                (current) => ({
                  ...current,
                  events: { ...current.events, hysteresisFactor: value as number },
                }),
                {
                  path: "hysteresis factor",
                  before: String(parameters.events.hysteresisFactor),
                  after: String(value),
                },
              )
            }
          />
        </Field>
        <Field label="Escape disappearance (s)">
          <ValidatedNumberInput
            type="number"
            step="0.05"
            value={parameters.events.escapeDisappearanceSeconds}
            schema={methodNumberSchemas.escapeDisappearanceSeconds}
            onCommit={(value) =>
              updateParameters(
                (current) => ({
                  ...current,
                  events: { ...current.events, escapeDisappearanceSeconds: value as number },
                }),
                {
                  path: "escape disappearance duration",
                  before: String(parameters.events.escapeDisappearanceSeconds),
                  after: String(value),
                },
              )
            }
          />
        </Field>
      </div>
      <details className="advanced">
        <summary>Advanced tracking and strategy thresholds</summary>
        <div className="method-grid">
          <Field label="Foreground threshold">
            <ValidatedNumberInput
              value={parameters.tracking.foregroundThreshold}
              schema={methodNumberSchemas.foregroundThreshold}
              onCommit={(value) =>
                updateParameters(
                  (current) => ({
                    ...current,
                    tracking: {
                      ...current.tracking,
                      foregroundThreshold: value,
                    },
                  }),
                  {
                    path: "foreground threshold",
                    before: String(parameters.tracking.foregroundThreshold),
                    after: String(value),
                  },
                )
              }
            />
          </Field>
          <Field label="Outlier multiplier">
            <ValidatedNumberInput
              type="number"
              value={parameters.cleanup.outlierMultiplier}
              schema={methodNumberSchemas.outlierMultiplier}
              onCommit={(value) =>
                updateParameters(
                  (current) => ({
                    ...current,
                    cleanup: { ...current.cleanup, outlierMultiplier: value as number },
                  }),
                  {
                    path: "outlier multiplier",
                    before: String(parameters.cleanup.outlierMultiplier),
                    after: String(value),
                  },
                )
              }
            />
          </Field>
          <Field label="Spatial max primary errors">
            <ValidatedNumberInput
              type="number"
              value={parameters.strategy.spatialMaxPrimaryErrors}
              schema={methodNumberSchemas.spatialMaxPrimaryErrors}
              onCommit={(value) =>
                updateParameters(
                  (current) => ({
                    ...current,
                    strategy: { ...current.strategy, spatialMaxPrimaryErrors: value as number },
                  }),
                  {
                    path: "spatial max primary errors",
                    before: String(parameters.strategy.spatialMaxPrimaryErrors),
                    after: String(value),
                  },
                )
              }
            />
          </Field>
          <Field label="Serial min adjacency">
            <ValidatedNumberInput
              type="number"
              step="0.05"
              value={parameters.strategy.serialMinAdjacencyRatio}
              schema={methodNumberSchemas.serialMinAdjacencyRatio}
              onCommit={(value) =>
                updateParameters(
                  (current) => ({
                    ...current,
                    strategy: { ...current.strategy, serialMinAdjacencyRatio: value as number },
                  }),
                  {
                    path: "serial adjacency",
                    before: String(parameters.strategy.serialMinAdjacencyRatio),
                    after: String(value),
                  },
                )
              }
            />
          </Field>
        </div>
      </details>
    </details>
  );
}
