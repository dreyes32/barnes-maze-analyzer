import { SCHEMA_VERSION } from "../domain/types";
import { parseSessionFile } from "../domain/schemas";
import type { AnalysisSession } from "../domain/types";

export function sessionToPortableJson(session: AnalysisSession): string {
  const portable: AnalysisSession = {
    ...session,
    schemaVersion: SCHEMA_VERSION,
    appVersion: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : session.appVersion,
    trials: session.trials.map((trial) => ({
      ...trial,
      videoRelinkRequired: true,
    })),
  };
  return `${JSON.stringify(portable, null, 2)}\n`;
}

export function parsePortableSession(text: string): AnalysisSession {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  const session = parseSessionFile(data);
  return {
    ...session,
    trials: session.trials.map((trial) => ({ ...trial, videoRelinkRequired: true })),
  };
}

export function downloadTextFile(filename: string, contents: string, mime = "application/json"): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function safeFilename(name: string): string {
  return name.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "session";
}
