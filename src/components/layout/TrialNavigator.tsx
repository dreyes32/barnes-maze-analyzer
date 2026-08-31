import { trialDisplayName } from "../../domain/session";
import { currentTrialSelector, useSessionStore } from "../../state/sessionStore";
import { StatusBadge } from "../ui";

export function TrialNavigator() {
  const session = useSessionStore((state) => state.session);
  const setCurrentTrial = useSessionStore((state) => state.setCurrentTrial);
  const current = currentTrialSelector(session);

  return (
    <aside className="sidebar">
      <h2 style={{ margin: "0 0 0.6rem", fontSize: "1rem" }}>Trials</h2>
      {session.trials.length === 0 ? (
        <p className="help">Import videos to start a session.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.4rem" }}>
          {session.trials.map((trial) => {
            const selected = trial.id === current?.id;
            return (
              <li key={trial.id}>
                <button
                  type="button"
                  className="issue"
                  aria-current={selected ? "true" : undefined}
                  onClick={() => setCurrentTrial(trial.id)}
                  style={{ width: "100%" }}
                >
                  <div>
                    <strong>{trialDisplayName(trial)}</strong>
                    <div className="help">{trial.source.fileName}</div>
                    <StatusBadge status={trial.reviewStatus} />
                    {trial.videoRelinkRequired ? <div className="help">Video needs relink</div> : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
