import type { ReactNode } from "react";
import { useSessionStore } from "../../state/sessionStore";
import { downloadTextFile, safeFilename, sessionToPortableJson } from "../../export/analysisJson";
import { parsePortableSession } from "../../export/analysisJson";
import { Banner } from "../ui";
import { StepIndicator } from "./StepIndicator";
import { TrialNavigator } from "./TrialNavigator";

export function AppShell({ children }: { children: ReactNode }) {
  const session = useSessionStore((state) => state.session);
  const savedAt = useSessionStore((state) => state.savedAt);
  const error = useSessionStore((state) => state.error);
  const setError = useSessionStore((state) => state.setError);
  const setName = useSessionStore((state) => state.setName);
  const replaceSession = useSessionStore((state) => state.replaceSession);

  const onSave = () => {
    downloadTextFile(`${safeFilename(session.name)}.barnes.json`, sessionToPortableJson(session));
  };

  const onOpen = async (file: File) => {
    try {
      const text = await file.text();
      replaceSession(parsePortableSession(text));
    } catch (caught) {
      setError({
        title: "Could not open analysis",
        detail: caught instanceof Error ? caught.message : "The file is not a compatible Barnes analysis.",
      });
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Barnes Maze Analyzer</h1>
          <p>Import videos → set arena → track → review → export</p>
        </div>
        <div className="row">
          {session.isDemo ? <span className="demo-flag">Example analysis</span> : null}
          <label className="field">
            <span className="sr-only">Session name</span>
            <input
              value={session.name}
              onChange={(event) => setName(event.target.value)}
              aria-label="Session name"
            />
          </label>
          <button type="button" className="btn-secondary" onClick={onSave}>
            Save analysis
          </button>
          <label className="btn-secondary">
            Open analysis
            <input
              type="file"
              accept=".json,.barnes.json,application/json"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onOpen(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <span className="saved" aria-live="polite">
            {savedAt ? `Saved locally ${new Date(savedAt).toLocaleTimeString()}` : "Autosave ready"}
          </span>
        </div>
      </header>
      <div className="subbar">
        <StepIndicator />
        <div className="help">Nothing essential is drag-only. Use buttons or the keyboard if a handle is inconvenient.</div>
      </div>
      {error ? (
        <div className="content" style={{ paddingBottom: 0 }}>
          <Banner kind="danger">
            <strong>{error.title}</strong> {error.detail}{" "}
            <button type="button" className="btn-ghost" onClick={() => setError(undefined)}>
              Dismiss
            </button>
            {error.technical ? (
              <details>
                <summary>Technical details</summary>
                <pre>{error.technical}</pre>
              </details>
            ) : null}
          </Banner>
        </div>
      ) : null}
      <div className="main">
        <TrialNavigator />
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
