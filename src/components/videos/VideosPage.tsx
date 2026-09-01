import { useCallback, useState } from "react";
import { describeVideoTiming } from "../../video/mp4Metadata";
import { probeVideoFile } from "../../video/probe";
import { currentTrialSelector, useSessionStore } from "../../state/sessionStore";
import { getVideoFile, registerVideoFile } from "../../state/videoRegistry";
import { fileMatchesMetadata, fingerprintFile } from "../../video/fingerprint";
import { formatClockDuration } from "../../domain/session";
import { loadDemoSession } from "../../demo/loadDemo";
import { Callout, Field, PageHeader, StatusBadge, WorkspaceFooter } from "../ui";
import { Dialog } from "../ui/Dialog";
import { Menu } from "../ui/Menu";

export function VideosPage() {
  const session = useSessionStore((state) => state.session);
  const addTrials = useSessionStore((state) => state.addTrials);
  const updateMetadata = useSessionStore((state) => state.updateMetadata);
  const bulkMetadata = useSessionStore((state) => state.bulkMetadata);
  const moveTrialToGroup = useSessionStore((state) => state.moveTrialToGroup);
  const replaceSession = useSessionStore((state) => state.replaceSession);
  const setError = useSessionStore((state) => state.setError);
  const setStage = useSessionStore((state) => state.setStage);
  const current = currentTrialSelector(session);
  const [activeDrop, setActiveDrop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string>();
  const [bulk, setBulk] = useState({ cohort: "", day: "" });
  const [timingHelp, setTimingHelp] = useState(false);

  const importFiles = useCallback(
    async (fileList: File[]) => {
      const videos = fileList.filter((file) => file.type.startsWith("video/") || file.name.toLowerCase().endsWith(".mp4"));
      if (videos.length === 0) {
        setError({
          title: "No supported videos",
          detail: "Import MP4 recordings. Other file types were ignored.",
        });
        return;
      }
      setBusy(true);
      try {
        const sources = [];
        for (const file of videos) {
          sources.push(await probeVideoFile(file));
        }
        const ids = addTrials(sources);
        ids.forEach((id, index) => registerVideoFile(id, videos[index]));
      } catch (error) {
        setError({
          title: "Could not import a video",
          detail: error instanceof Error ? error.message : "One of the selected files could not be read.",
        });
      } finally {
        setBusy(false);
      }
    },
    [addTrials, setError],
  );

  const onRelink = async (trialId: string, file: File) => {
    const trial = session.trials.find((item) => item.id === trialId);
    if (!trial) return;
    try {
      const fingerprint = await fingerprintFile(file);
      const match = fileMatchesMetadata(file, trial.source, fingerprint);
      if (!match.ok) {
        setError({ title: "Video does not match", detail: match.reason ?? "Choose the original recording." });
        return;
      }
      registerVideoFile(trialId, file);
      replaceSession({
        ...session,
        trials: session.trials.map((item) =>
          item.id === trialId ? { ...item, videoRelinkRequired: false } : item,
        ),
      });
    } catch (error) {
      setError({
        title: "Could not relink video",
        detail: error instanceof Error ? error.message : "The selected file could not be opened.",
      });
    }
  };

  const toggleSelected = (id: string) => {
    setSelected((currentIds) => (currentIds.includes(id) ? currentIds.filter((item) => item !== id) : [...currentIds, id]));
  };

  return (
    <>
      <PageHeader title="Videos">
        <p>Add Barnes maze recordings and assign experiment metadata.</p>
      </PageHeader>

      <section className="card">
        <div
          className="dropzone"
          data-active={activeDrop}
          onDragOver={(event) => {
            event.preventDefault();
            setActiveDrop(true);
          }}
          onDragLeave={() => setActiveDrop(false)}
          onDrop={(event) => {
            event.preventDefault();
            setActiveDrop(false);
            void importFiles([...event.dataTransfer.files]);
          }}
        >
          <h3>Add Barnes maze videos</h3>
          <p className="help">{busy ? "Reading video metadata…" : "Drop MP4 recordings here"}</p>
          <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
            <label className="btn">
              Browse files
              <input
                type="file"
                accept="video/mp4,video/*"
                multiple
                className="sr-only"
                onChange={(event) => {
                  void importFiles([...(event.target.files ?? [])]);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {"showDirectoryPicker" in window ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={async () => {
                  try {
                    const handle = await window.showDirectoryPicker?.({ mode: "read" });
                    if (!handle) return;
                    const files: File[] = [];
                    for await (const entry of handle.values()) {
                      if (entry.kind === "file") {
                        files.push(await (entry as FileSystemFileHandle).getFile());
                      }
                    }
                    await importFiles(files);
                  } catch (error) {
                    if (error instanceof DOMException && error.name === "AbortError") return;
                    setError({
                      title: "Folder selection failed",
                      detail: "Use Browse files if folder selection is blocked in this browser.",
                    });
                  }
                }}
              >
                Choose experiment folder
              </button>
            ) : null}
          </div>
          <p className="micro" style={{ marginTop: 12 }}>
            Videos remain on this computer.
          </p>
        </div>
      </section>

      {session.trials.length === 0 ? (
        <section className="empty-state">
          <h3>No trials yet</h3>
          <p className="help">Add Barnes maze recordings to begin an analysis, or open the labeled example.</p>
          <div className="row" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => replaceSession(loadDemoSession(), { demo: true })}
            >
              Load demo analysis
            </button>
          </div>
        </section>
      ) : (
        <section className="card">
          <p className="eyebrow">{session.trials.length} trials</p>
          <div className="row" style={{ margin: "12px 0" }}>
            <label className="row">
              <input
                type="checkbox"
                checked={selected.length === session.trials.length && session.trials.length > 0}
                onChange={(event) =>
                  setSelected(event.target.checked ? session.trials.map((trial) => trial.id) : [])
                }
              />
              Select all
            </label>
          </div>
          {selected.length > 0 ? (
            <div className="row" style={{ margin: "0 0 12px" }}>
              <span className="help">{selected.length} selected</span>
              <Field label="Set cohort">
                <input value={bulk.cohort} onChange={(event) => setBulk({ ...bulk, cohort: event.target.value })} />
              </Field>
              <Field label="Set day">
                <input value={bulk.day} onChange={(event) => setBulk({ ...bulk, day: event.target.value })} />
              </Field>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => bulkMetadata({ cohort: bulk.cohort || undefined, day: bulk.day || undefined }, selected)}
              >
                Apply
              </button>
              {(session.trialGroups ?? []).map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className="btn-ghost"
                  onClick={() => selected.forEach((id) => moveTrialToGroup(id, group.id))}
                >
                  Move to {group.name}
                </button>
              ))}
            </div>
          ) : null}
          {session.trials.map((trial) => {
            const meta = [
              trial.experimentMetadata.animalId,
              trial.experimentMetadata.cohort,
              trial.experimentMetadata.day,
              trial.experimentMetadata.trial ? `Trial ${trial.experimentMetadata.trial}` : undefined,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <article key={trial.id} className="trial-row">
                <div className="trial-row-top">
                  <label className="row">
                    <input
                      type="checkbox"
                      checked={selected.includes(trial.id)}
                      onChange={() => toggleSelected(trial.id)}
                      aria-label={`Select ${trial.source.fileName}`}
                    />
                    <strong>{trial.source.fileName}</strong>
                  </label>
                  <StatusBadge status={trial.reviewStatus} />
                </div>
                <div className="trial-meta">{meta || "—"}</div>
                <div className="trial-meta">
                  {formatClockDuration(trial.source.durationSeconds)} · {trial.source.width}×{trial.source.height} ·{" "}
                  {describeVideoTiming(trial.source)}
                </div>
                {trial.source.timebase?.isVariableFrameRate && trial.id === current?.id ? (
                  <Callout kind="info">
                    <div>
                      <strong>Variable frame timing detected</strong>
                      <div>Measurements use source timestamps; frame numbers may be approximate.</div>
                      <button type="button" className="btn-ghost" onClick={() => setTimingHelp(true)}>
                        Learn more
                      </button>
                    </div>
                  </Callout>
                ) : null}
                <div className="row">
                  <button type="button" className="btn-ghost" onClick={() => setEditingId(editingId === trial.id ? undefined : trial.id)}>
                    Edit metadata
                  </button>
                  {getVideoFile(trial.id) ? (
                    <span className="help">Linked</span>
                  ) : (
                    <label className="btn-secondary">
                      Relink video
                      <input
                        type="file"
                        accept="video/mp4,video/*"
                        className="sr-only"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void onRelink(trial.id, file);
                        }}
                      />
                    </label>
                  )}
                  <Menu label="⋯" ariaLabel={`More actions for ${trial.source.fileName}`}>
                    <button type="button" role="menuitem" onClick={() => setEditingId(trial.id)}>
                      Edit metadata
                    </button>
                  </Menu>
                </div>
                {editingId === trial.id ? (
                  <div className="row" style={{ marginTop: 8 }}>
                    <Field label="Animal">
                      <input
                        aria-label={`Animal ID for ${trial.source.fileName}`}
                        value={trial.experimentMetadata.animalId ?? ""}
                        onChange={(event) => updateMetadata(trial.id, { animalId: event.target.value })}
                      />
                    </Field>
                    <Field label="Cohort">
                      <input
                        aria-label={`Cohort for ${trial.source.fileName}`}
                        value={trial.experimentMetadata.cohort ?? ""}
                        onChange={(event) => updateMetadata(trial.id, { cohort: event.target.value })}
                      />
                    </Field>
                    <Field label="Day">
                      <input
                        aria-label={`Day for ${trial.source.fileName}`}
                        value={trial.experimentMetadata.day ?? ""}
                        onChange={(event) => updateMetadata(trial.id, { day: event.target.value })}
                      />
                    </Field>
                    <Field label="Trial">
                      <input
                        aria-label={`Trial number for ${trial.source.fileName}`}
                        value={trial.experimentMetadata.trial ?? ""}
                        onChange={(event) => updateMetadata(trial.id, { trial: event.target.value })}
                      />
                    </Field>
                    <Field label="Notes">
                      <input
                        aria-label={`Notes for ${trial.source.fileName}`}
                        value={trial.experimentMetadata.notes ?? ""}
                        onChange={(event) => updateMetadata(trial.id, { notes: event.target.value })}
                      />
                    </Field>
                  </div>
                ) : null}
              </article>
            );
          })}
          <WorkspaceFooter note={`${session.trials.length} trial${session.trials.length === 1 ? "" : "s"} ready`}>
            <button type="button" className="btn" onClick={() => setStage("arena")}>
              Continue to Arena →
            </button>
          </WorkspaceFooter>
        </section>
      )}
      {timingHelp ? (
        <Dialog title="Variable frame timing" onClose={() => setTimingHelp(false)}>
          <p className="help">
            Some recordings, including NTSC-family video such as 15000/1001 fps, do not have an integer frame rate.
            Barnes Maze Analyzer uses the file’s source timestamps for measurements. Displayed frame numbers can be
            approximate when timing is variable.
          </p>
          <div className="row" style={{ marginTop: 16 }}>
            <button type="button" className="btn" onClick={() => setTimingHelp(false)}>
              Close
            </button>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
