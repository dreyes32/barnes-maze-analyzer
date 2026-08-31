import { create } from "zustand";
import { DEFAULT_PARAMETERS } from "../domain/defaults";
import { createId, nowIso } from "../domain/ids";
import { describeParameterImpact, formatParameterImpact, recomputeSession, recomputeTrial } from "../domain/pipeline";
import { createEmptySession, createTrial } from "../domain/session";
import type {
  AnalysisParameters,
  AnalysisSession,
  ArenaGeometry,
  CorrectionKind,
  CorrectionRecord,
  ExperimentMetadata,
  ParameterChangeImpact,
  SearchStrategyLabel,
  TrackingResult,
  VideoSourceMetadata,
  WorkflowStage,
} from "../domain/types";
import { saveSession } from "../persistence/db";
import { hasVideo } from "./videoRegistry";

type AppError = {
  title: string;
  detail: string;
  technical?: string;
};

type TrackingUi = {
  trialId?: string;
  running: boolean;
  cancelled: boolean;
  stage?: "background" | "tracking";
  current: number;
  total: number;
  timestampSeconds: number;
};

type SessionState = {
  session: AnalysisSession;
  hydrated: boolean;
  savedAt?: string;
  error?: AppError;
  lastImpact?: ParameterChangeImpact;
  lastImpactText?: string;
  tracking: TrackingUi;
  setHydrated: (session?: AnalysisSession) => void;
  replaceSession: (session: AnalysisSession, options?: { demo?: boolean }) => void;
  setName: (name: string) => void;
  setStage: (stage: WorkflowStage) => void;
  setCurrentTrial: (trialId: string) => void;
  addTrials: (sources: VideoSourceMetadata[]) => string[];
  updateMetadata: (trialId: string, metadata: ExperimentMetadata) => void;
  bulkMetadata: (metadata: ExperimentMetadata) => void;
  setArena: (trialId: string, arena: ArenaGeometry) => void;
  reuseArena: (fromTrialId: string, toTrialId: string, arena: ArenaGeometry) => void;
  setTrackingResult: (trialId: string, tracking: TrackingResult) => void;
  setTrackingProgress: (progress: Partial<TrackingUi>) => void;
  addCorrection: (trialId: string, correction: Omit<CorrectionRecord, "id" | "createdAt">) => void;
  undoLastCorrection: (trialId: string) => void;
  overrideStrategy: (trialId: string, strategy: SearchStrategyLabel) => void;
  markReviewed: (trialId: string, status: "reviewed" | "complete" | "needs-review") => void;
  updateParameters: (updater: (current: AnalysisParameters) => AnalysisParameters, labels: {
    path: string;
    before: string;
    after: string;
  }) => void;
  setError: (error?: AppError) => void;
  persist: () => Promise<void>;
};

async function persist(session: AnalysisSession): Promise<string> {
  const next = { ...session, updatedAt: nowIso() };
  await saveSession(next);
  return next.updatedAt;
}

function withTrial(
  session: AnalysisSession,
  trialId: string,
  updater: (trial: AnalysisSession["trials"][number]) => AnalysisSession["trials"][number],
): AnalysisSession {
  return {
    ...session,
    updatedAt: nowIso(),
    trials: session.trials.map((trial) => (trial.id === trialId ? updater(trial) : trial)),
  };
}

export const useSessionStore = create<SessionState>((set, get) => ({
  session: createEmptySession(),
  hydrated: false,
  tracking: { running: false, cancelled: false, current: 0, total: 0, timestampSeconds: 0 },

  setHydrated: (session) => {
    const restored = session ?? createEmptySession();
    const withRelink = {
      ...restored,
      trials: restored.trials.map((trial) => ({
        ...trial,
        videoRelinkRequired: !hasVideo(trial.id),
      })),
    };
    set({ session: withRelink, hydrated: true });
  },

  replaceSession: (session, options) => {
    const next = recomputeSession({
      ...session,
      isDemo: options?.demo ?? session.isDemo,
      demoLabel: options?.demo ? "Example analysis" : session.demoLabel,
      trials: session.trials.map((trial) => ({
        ...trial,
        videoRelinkRequired: !hasVideo(trial.id),
      })),
    });
    set({ session: next, lastImpact: undefined, lastImpactText: undefined });
    void get().persist();
  },

  setName: (name) => {
    set({ session: { ...get().session, name, updatedAt: nowIso() } });
    void get().persist();
  },

  setStage: (stage) => {
    set({ session: { ...get().session, currentStage: stage, updatedAt: nowIso() } });
    void get().persist();
  },

  setCurrentTrial: (trialId) => {
    set({ session: { ...get().session, currentTrialId: trialId, updatedAt: nowIso() } });
    void get().persist();
  },

  addTrials: (sources) => {
    const trials = sources.map((source) => createTrial(source));
    const session = get().session;
    const next: AnalysisSession = {
      ...session,
      trials: [...session.trials, ...trials],
      currentTrialId: session.currentTrialId ?? trials[0]?.id,
      updatedAt: nowIso(),
    };
    set({ session: next });
    void get().persist();
    return trials.map((trial) => trial.id);
  },

  updateMetadata: (trialId, metadata) => {
    set({
      session: withTrial(get().session, trialId, (trial) => ({
        ...trial,
        experimentMetadata: { ...trial.experimentMetadata, ...metadata },
      })),
    });
    void get().persist();
  },

  bulkMetadata: (metadata) => {
    const session = get().session;
    set({
      session: {
        ...session,
        updatedAt: nowIso(),
        trials: session.trials.map((trial) => ({
          ...trial,
          experimentMetadata: { ...trial.experimentMetadata, ...metadata },
        })),
      },
    });
    void get().persist();
  },

  setArena: (trialId, arena) => {
    const session = get().session;
    const next = recomputeSession(
      withTrial(session, trialId, (trial) => ({
        ...trial,
        arena,
        reviewStatus: trial.tracking ? trial.reviewStatus : "arena-ready",
      })),
    );
    set({ session: next });
    void get().persist();
  },

  reuseArena: (fromTrialId, toTrialId, arena) => {
    const session = get().session;
    const next = recomputeSession(
      withTrial(session, toTrialId, (trial) => ({
        ...trial,
        arena: {
          ...arena,
          geometrySource: arena.geometrySource === "manual" ? "reused" : arena.geometrySource,
          registration: {
            translationX: arena.registration?.translationX ?? 0,
            translationY: arena.registration?.translationY ?? 0,
            scale: arena.registration?.scale ?? 1,
            rotationRadians: arena.registration?.rotationRadians ?? 0,
            fromTrialId,
          },
        },
        reviewStatus: trial.tracking ? trial.reviewStatus : "arena-ready",
      })),
    );
    set({ session: next });
    void get().persist();
  },

  setTrackingResult: (trialId, tracking) => {
    const session = get().session;
    const next = recomputeSession(
      withTrial(session, trialId, (trial) => ({
        ...trial,
        tracking,
        reviewStatus: tracking.cancelled ? "needs-review" : "needs-review",
      })),
    );
    set({ session: next });
    void get().persist();
  },

  setTrackingProgress: (progress) => {
    set({ tracking: { ...get().tracking, ...progress } });
  },

  addCorrection: (trialId, correction) => {
    const record: CorrectionRecord = {
      ...correction,
      id: createId("corr"),
      createdAt: nowIso(),
    };
    const session = get().session;
    const next = recomputeSession(
      withTrial(session, trialId, (trial) => ({
        ...trial,
        corrections: [...trial.corrections, record],
      })),
    );
    set({ session: next });
    void get().persist();
  },

  undoLastCorrection: (trialId) => {
    const session = get().session;
    const next = recomputeSession(
      withTrial(session, trialId, (trial) => ({
        ...trial,
        corrections: trial.corrections.slice(0, -1),
      })),
    );
    set({ session: next });
    void get().persist();
  },

  overrideStrategy: (trialId, strategy) => {
    get().addCorrection(trialId, {
      timestampSeconds: 0,
      kind: "strategy-override" satisfies CorrectionKind,
      correctedValue: strategy,
    });
  },

  markReviewed: (trialId, status) => {
    set({
      session: withTrial(get().session, trialId, (trial) => ({ ...trial, reviewStatus: status })),
    });
    void get().persist();
  },

  updateParameters: (updater, labels) => {
    const before = get().session;
    const nextParams = updater(before.parameters);
    const after = recomputeSession({ ...before, parameters: nextParams, updatedAt: nowIso() });
    const impact = describeParameterImpact(before, after, labels.path, labels.before, labels.after);
    set({
      session: after,
      lastImpact: impact,
      lastImpactText: formatParameterImpact(impact),
    });
    void get().persist();
  },

  setError: (error) => set({ error }),

  persist: async () => {
    try {
      const savedAt = await persist(get().session);
      set({ savedAt, session: { ...get().session, updatedAt: savedAt } });
    } catch (error) {
      set({
        error: {
          title: "Could not save locally",
          detail: "The browser could not write this session to IndexedDB. Your latest change may not survive a refresh.",
          technical: error instanceof Error ? error.message : String(error),
        },
      });
    }
  },
}));

export { DEFAULT_PARAMETERS };
export function currentTrialSelector(session: AnalysisSession) {
  return session.trials.find((trial) => trial.id === session.currentTrialId) ?? session.trials[0];
}

export function recomputeOne(trialId: string): void {
  const { session } = useSessionStore.getState();
  const trial = session.trials.find((item) => item.id === trialId);
  if (!trial) return;
  const next = recomputeTrial(trial, session.parameters);
  useSessionStore.setState({
    session: {
      ...session,
      trials: session.trials.map((item) => (item.id === trialId ? next : item)),
    },
  });
}
