import Dexie, { type Table } from "dexie";
import type { AnalysisSession, WorkflowStage } from "../domain/types";

export type PersistedSession = AnalysisSession;

export type VideoLink = {
  trialId: string;
  fileName: string;
  fileSize: number;
  sourceFingerprint: string;
  lastLinkedAt: string;
};

export type AppMeta = {
  key: string;
  value: unknown;
};

export class BarnesDatabase extends Dexie {
  sessions!: Table<PersistedSession, string>;
  videoLinks!: Table<VideoLink, string>;
  meta!: Table<AppMeta, string>;

  constructor() {
    super("barnes-maze-analyzer");
    this.version(1).stores({
      sessions: "id, updatedAt, name",
      videoLinks: "trialId, sourceFingerprint, fileName",
      meta: "key",
    });
  }
}

export const db = new BarnesDatabase();

export async function saveSession(session: AnalysisSession): Promise<void> {
  await db.sessions.put(session);
  await db.meta.put({ key: "currentSessionId", value: session.id });
  await db.meta.put({ key: "currentStage", value: session.currentStage });
}

export async function loadCurrentSession(): Promise<AnalysisSession | undefined> {
  const meta = await db.meta.get("currentSessionId");
  if (!meta || typeof meta.value !== "string") return undefined;
  return db.sessions.get(meta.value);
}

export async function listSessions(): Promise<AnalysisSession[]> {
  return db.sessions.orderBy("updatedAt").reverse().toArray();
}

export async function deleteSession(id: string): Promise<void> {
  await db.sessions.delete(id);
}

export async function recordVideoLink(link: VideoLink): Promise<void> {
  await db.videoLinks.put(link);
}

export async function getVideoLink(trialId: string): Promise<VideoLink | undefined> {
  return db.videoLinks.get(trialId);
}

export async function rememberStage(stage: WorkflowStage): Promise<void> {
  await db.meta.put({ key: "currentStage", value: stage });
}
