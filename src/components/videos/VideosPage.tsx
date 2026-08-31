import { useCallback, useState } from "react";
import { describeVideoTiming } from "../../video/mp4Metadata";
import { probeVideoFile } from "../../video/probe";
import { currentTrialSelector, useSessionStore } from "../../state/sessionStore";
import { getVideoFile, registerVideoFile } from "../../state/videoRegistry";
import { fileMatchesMetadata, fingerprintFile } from "../../video/fingerprint";
import { Banner, Field, StatusBadge } from "../ui";

export function VideosPage() {
  const session = useSessionStore((state) => state.session);
  const addTrials = useSessionStore((state) => state.addTrials);
  const updateMetadata = useSessionStore((state) => state.updateMetadata);
  const bulkMetadata = useSessionStore((state) => state.bulkMetadata);
  const replaceSession = useSessionStore((state) => state.replaceSession);
  const setError = useSessionStore((state) => state.setError);
  const setStage = useSessionStore((state) => state.setStage);
  const current = currentTrialSelector(session);
  const [activeDrop, setActiveDrop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bulk, setBulk] = useState({ cohort: "", day: "" });

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

  return (
    <>
      <section className="card">
        <h2>Videos</h2>
        <p className="help">
          Import one or more Barnes maze recordings. Filenames are not treated as animal IDs — enter those
          yourself. Videos stay on this computer.
        </p>
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
          <p>{busy ? "Reading video metadata…" : "Drop MP4 files here"}</p>
          <div className="row" style={{ justifyContent: "center" }}>
            <label className="btn">
              Choose files
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
                        const file = await (entry as FileSystemFileHandle).getFile();
                        files.push(file);
                      }
                    }
                    await importFiles(files);
                  } catch (error) {
                    if (error instanceof DOMException && error.name === "AbortError") return;
                    setError({
                      title: "Folder selection failed",
                      detail: "Use Choose files if folder selection is blocked in this browser.",
                    });
                  }
                }}
              >
                Choose folder
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {session.trials.length > 0 ? (
        <section className="card">
          <h3>Trial list</h3>
          <div className="row">
            <Field label="Bulk cohort">
              <input value={bulk.cohort} onChange={(event) => setBulk({ ...bulk, cohort: event.target.value })} />
            </Field>
            <Field label="Bulk day">
              <input value={bulk.day} onChange={(event) => setBulk({ ...bulk, day: event.target.value })} />
            </Field>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => bulkMetadata({ cohort: bulk.cohort || undefined, day: bulk.day || undefined })}
            >
              Apply to all trials
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Duration</th>
                  <th>Resolution</th>
                  <th>Frame rate</th>
                  <th>Animal</th>
                  <th>Cohort</th>
                  <th>Day</th>
                  <th>Trial</th>
                  <th>Status</th>
                  <th>Video</th>
                </tr>
              </thead>
              <tbody>
                {session.trials.map((trial) => (
                  <tr key={trial.id}>
                    <td>{trial.source.fileName}</td>
                    <td>{trial.source.durationSeconds.toFixed(2)} s</td>
                    <td>
                      {trial.source.width}×{trial.source.height}
                    </td>
                    <td>{describeVideoTiming(trial.source)}</td>
                    <td>
                      <input
                        aria-label={`Animal ID for ${trial.source.fileName}`}
                        value={trial.experimentMetadata.animalId ?? ""}
                        onChange={(event) => updateMetadata(trial.id, { animalId: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Cohort for ${trial.source.fileName}`}
                        value={trial.experimentMetadata.cohort ?? ""}
                        onChange={(event) => updateMetadata(trial.id, { cohort: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Day for ${trial.source.fileName}`}
                        value={trial.experimentMetadata.day ?? ""}
                        onChange={(event) => updateMetadata(trial.id, { day: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Trial number for ${trial.source.fileName}`}
                        value={trial.experimentMetadata.trial ?? ""}
                        onChange={(event) => updateMetadata(trial.id, { trial: event.target.value })}
                      />
                    </td>
                    <td>
                      <StatusBadge status={trial.reviewStatus} />
                    </td>
                    <td>
                      {getVideoFile(trial.id) ? (
                        "Linked"
                      ) : (
                        <label className="btn-secondary">
                          Relink
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {current?.source.timebase?.isVariableFrameRate ? (
            <Banner kind="warn">
              This source looks variable-frame-rate. Timestamps are used for science; frame indices may be approximate.
            </Banner>
          ) : null}
          <button type="button" className="btn" onClick={() => setStage("arena")}>
            Continue to arena setup
          </button>
        </section>
      ) : null}
    </>
  );
}
