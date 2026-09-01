import { useRef, useState, type ReactNode } from "react";
import { useSessionStore } from "../../state/sessionStore";
import { downloadTextFile, parsePortableSession, safeFilename, sessionToPortableJson } from "../../export/analysisJson";
import { Banner } from "../ui";
import { Dialog } from "../ui/Dialog";
import { Menu } from "../ui/Menu";
import { StepIndicator } from "./StepIndicator";
import { TrialNavigator } from "./TrialNavigator";

export function AppShell({ children }: { children: ReactNode }) {
  const session = useSessionStore((state) => state.session);
  const savedAt = useSessionStore((state) => state.savedAt);
  const error = useSessionStore((state) => state.error);
  const setError = useSessionStore((state) => state.setError);
  const setName = useSessionStore((state) => state.setName);
  const replaceSession = useSessionStore((state) => state.replaceSession);
  const resetSession = useSessionStore((state) => state.resetSession);
  const [helpOpen, setHelpOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth > 1024,
  );
  const openRef = useRef<HTMLInputElement>(null);

  const onSave = () => {
    downloadTextFile(`${safeFilename(session.name)}.barnes.json`, sessionToPortableJson(session));
  };

  const onOpen = async (file: File) => {
    try {
      replaceSession(parsePortableSession(await file.text()));
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
          <p>Local behavioral analysis for Barnes maze experiments</p>
        </div>
        <div className="header-tools">
          {session.isDemo ? <span className="demo-flag">Example analysis</span> : null}
          <input
            className="session-title"
            value={session.name}
            onChange={(event) => setName(event.target.value)}
            aria-label="Session name"
          />
          <span
            className="saved"
            aria-live="polite"
            title={savedAt ? `Last saved locally at ${new Date(savedAt).toLocaleTimeString()}` : "Autosave ready"}
          >
            {savedAt ? "✓ Saved locally" : "Autosave ready"}
          </span>
          <Menu label="⋯" ariaLabel="Session menu">
            <button type="button" role="menuitem" onClick={onSave}>
              Save analysis file
            </button>
            <label role="menuitem">
              Open analysis file
              <input
                ref={openRef}
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
            <button
              type="button"
              role="menuitem"
              onClick={() => document.querySelector<HTMLInputElement>(".session-title")?.focus()}
            >
              Rename session
            </button>
            <div className="menu-sep" />
            <button type="button" role="menuitem" onClick={() => setResetOpen(true)}>
              Reset session
            </button>
          </Menu>
          <button type="button" className="btn-ghost" onClick={() => setHelpOpen(true)}>
            Help
          </button>
        </div>
      </header>
      <div className="subbar">
        <button
          type="button"
          className="btn-ghost sidebar-toggle"
          onClick={() => setSidebarOpen((value) => !value)}
        >
          Trials
        </button>
        <StepIndicator />
      </div>
      {error ? (
        <div className="content" style={{ paddingBottom: 0 }}>
          <Banner kind="danger">
            <strong>{error.title}</strong> {error.detail}{" "}
            <button type="button" className="btn-ghost" onClick={() => setError(undefined)}>
              Dismiss
            </button>
          </Banner>
        </div>
      ) : null}
      <div className="main">
        <TrialNavigator collapsed={!sidebarOpen} />
        <main className="content">{children}</main>
      </div>
      {helpOpen ? (
        <Dialog title="Help" onClose={() => setHelpOpen(false)}>
          <h3>Keyboard shortcuts</h3>
          <p className="help">Arrow keys move through samples on Review. Shift+arrows step source frames. Space plays or pauses.</p>
          <h3>Privacy / data handling</h3>
          <p className="help">Imported recordings stay on this computer. Tracking and exports run in the browser.</p>
          <h3>Accessibility</h3>
          <p className="help">Nothing essential is drag-only. Use buttons or the keyboard if a handle is inconvenient.</p>
          <div className="row" style={{ marginTop: 16 }}>
            <button type="button" className="btn" onClick={() => setHelpOpen(false)}>
              Close
            </button>
          </div>
        </Dialog>
      ) : null}
      {resetOpen ? (
        <Dialog title="Reset this session?" onClose={() => setResetOpen(false)}>
          <p className="help">This clears trials and analysis from Barnes Maze Analyzer. Original video files on your computer are not deleted.</p>
          <div className="row" style={{ marginTop: 16 }}>
            <button type="button" className="btn-ghost" onClick={() => setResetOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => {
                resetSession();
                setResetOpen(false);
              }}
            >
              Reset session
            </button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
