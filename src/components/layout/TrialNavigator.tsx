import { useState } from "react";
import { formatClockDuration, trialDisplayName } from "../../domain/session";
import { currentTrialSelector, useSessionStore } from "../../state/sessionStore";
import { StatusBadge } from "../ui";
import { Dialog } from "../ui/Dialog";
import { Menu } from "../ui/Menu";

export function TrialNavigator({ collapsed = false }: { collapsed?: boolean }) {
  const session = useSessionStore((state) => state.session);
  const setCurrentTrial = useSessionStore((state) => state.setCurrentTrial);
  const setStage = useSessionStore((state) => state.setStage);
  const addGroup = useSessionStore((state) => state.addGroup);
  const renameGroup = useSessionStore((state) => state.renameGroup);
  const toggleGroup = useSessionStore((state) => state.toggleGroup);
  const deleteGroup = useSessionStore((state) => state.deleteGroup);
  const moveTrialToGroup = useSessionStore((state) => state.moveTrialToGroup);
  const removeTrial = useSessionStore((state) => state.removeTrial);
  const current = currentTrialSelector(session);
  const [pendingRemove, setPendingRemove] = useState<string>();
  const groups = session.trialGroups ?? [];

  const renderTrial = (trial: (typeof session.trials)[number]) => {
    const selected = trial.id === current?.id;
    const animal = trial.experimentMetadata.animalId;
    return (
      <li key={trial.id}>
        <div className="row" style={{ alignItems: "stretch" }}>
          <button
            type="button"
            className="trial-item"
            aria-current={selected ? "true" : undefined}
            onClick={() => setCurrentTrial(trial.id)}
          >
            <strong>{trial.source.fileName}</strong>
            <div className="trial-meta">
              {animal ?? trialDisplayName(trial)}
              {trial.experimentMetadata.day ? ` · ${trial.experimentMetadata.day}` : ""}
            </div>
            <StatusBadge status={trial.reviewStatus} />
          </button>
          <Menu label="⋯" ariaLabel={`Trial actions for ${trial.source.fileName}`}>
            <button type="button" role="menuitem" onClick={() => setStage("videos")}>
              Edit metadata
            </button>
            {groups.map((group) => (
              <button key={group.id} type="button" role="menuitem" onClick={() => moveTrialToGroup(trial.id, group.id)}>
                Move to {group.name}
              </button>
            ))}
            {trial.groupId ? (
              <button type="button" role="menuitem" onClick={() => moveTrialToGroup(trial.id, undefined)}>
                Remove from group
              </button>
            ) : null}
            <div className="menu-sep" />
            <button type="button" role="menuitem" onClick={() => setPendingRemove(trial.id)}>
              Remove from session
            </button>
          </Menu>
        </div>
      </li>
    );
  };

  const pending = session.trials.find((trial) => trial.id === pendingRemove);

  return (
    <aside className="sidebar" data-collapsed={collapsed || undefined} aria-label="Trials">
      <div className="sidebar-head">
        <h2>Trials</h2>
        <Menu label="+" ariaLabel="Add to session">
          <button type="button" role="menuitem" onClick={() => setStage("videos")}>
            Import videos
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const name = window.prompt("Group name", "Day 1");
              if (name) addGroup(name);
            }}
          >
            New group
          </button>
        </Menu>
      </div>
      {session.trials.length === 0 ? (
        <p className="help">Import videos to start a session.</p>
      ) : (
        <>
          {groups.map((group) => {
            const members = session.trials.filter((trial) => trial.groupId === group.id);
            return (
              <div key={group.id}>
                <button type="button" className="group-head" onClick={() => toggleGroup(group.id)} aria-expanded={!group.collapsed}>
                  {group.collapsed ? "▸" : "▾"} {group.name}
                </button>
                {group.collapsed ? null : <ul className="trial-nav">{members.map(renderTrial)}</ul>}
                <div className="row">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      const name = window.prompt("Rename group", group.name);
                      if (name) renameGroup(group.id, name);
                    }}
                  >
                    Rename
                  </button>
                  {members.length === 0 ? (
                    <button type="button" className="btn-ghost" onClick={() => deleteGroup(group.id)}>
                      Delete group
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
          <ul className="trial-nav">
            {session.trials.filter((trial) => !trial.groupId || !groups.some((group) => group.id === trial.groupId)).map(renderTrial)}
          </ul>
        </>
      )}
      {pending ? (
        <Dialog title={`Remove ${pending.source.fileName} from this session?`} onClose={() => setPendingRemove(undefined)}>
          <p>
            This removes the trial
            {pending.tracking || pending.corrections.length || pending.events.length || pending.metrics
              ? " and its analysis data"
              : ""}{" "}
            from Barnes Maze Analyzer.
          </p>
          <p className="help">The original video file on your computer will not be deleted.</p>
          <div className="row" style={{ marginTop: 16 }}>
            <button type="button" className="btn-ghost" onClick={() => setPendingRemove(undefined)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => {
                removeTrial(pending.id);
                setPendingRemove(undefined);
              }}
            >
              Remove trial
            </button>
          </div>
        </Dialog>
      ) : null}
      <p className="sr-only">{formatClockDuration(current?.source.durationSeconds)}</p>
    </aside>
  );
}
