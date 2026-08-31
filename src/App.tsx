import { useEffect } from "react";
import { AppShell } from "./components/layout/AppShell";
import { VideosPage } from "./components/videos/VideosPage";
import { ArenaPage } from "./components/arena/ArenaPage";
import { TrackPage } from "./components/tracking/TrackPage";
import { ReviewPage } from "./components/review/ReviewPage";
import { ResultsPage } from "./components/results/ResultsPage";
import { loadCurrentSession } from "./persistence/db";
import { useSessionStore } from "./state/sessionStore";
import { loadDemoSession } from "./demo/loadDemo";
import { Banner } from "./components/ui";

export function App() {
  const hydrated = useSessionStore((state) => state.hydrated);
  const stage = useSessionStore((state) => state.session.currentStage);
  const setHydrated = useSessionStore((state) => state.setHydrated);
  const replaceSession = useSessionStore((state) => state.replaceSession);
  const trials = useSessionStore((state) => state.session.trials);

  useEffect(() => {
    void loadCurrentSession()
      .then((session) => setHydrated(session))
      .catch(() => setHydrated(undefined));
  }, [setHydrated]);

  if (!hydrated) {
    return (
      <div className="content">
        <p>Restoring the last local session…</p>
      </div>
    );
  }

  const page =
    stage === "arena" ? (
      <ArenaPage />
    ) : stage === "track" ? (
      <TrackPage />
    ) : stage === "review" ? (
      <ReviewPage />
    ) : stage === "results" ? (
      <ResultsPage />
    ) : (
      <VideosPage />
    );

  return (
    <AppShell>
      {trials.length === 0 ? (
        <section className="card">
          <h2>Start here</h2>
          <p>
            Turn Barnes maze videos into latency, errors, path measures, and a transparent search-strategy
            classification — in the browser, without uploading recordings.
          </p>
          <div className="row">
            <button
              type="button"
              className="btn"
              onClick={() => replaceSession(loadDemoSession(), { demo: true })}
            >
              Load demo analysis
            </button>
          </div>
          <p className="help">
            Example analysis is precomputed and labeled. Use Import on the Videos step to run analysis on your
            own files.
          </p>
        </section>
      ) : null}
      {page}
      {trials.some((trial) => trial.videoRelinkRequired) && stage !== "videos" ? (
        <Banner kind="warn">
          One or more videos need to be relinked after reload. Analysis and corrections are already restored —
          open Videos and choose the original files.
        </Banner>
      ) : null}
    </AppShell>
  );
}
