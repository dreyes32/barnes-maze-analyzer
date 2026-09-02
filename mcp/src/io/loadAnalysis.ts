import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parseSessionFile } from "../../../src/domain/schemas";
import type { AnalysisSession } from "../../../src/domain/types";
import { ConfigError, logError } from "../config";

export type LoadedAnalysisFile = {
  analysisId: string;
  fileName: string;
  absolutePath: string;
  session: AnalysisSession;
};

const BARNES_EXTENSION = ".barnes.json";

export function isBarnesJsonName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(BARNES_EXTENSION);
}

function readValidatedSession(absolutePath: string): AnalysisSession {
  const raw = readFileSync(absolutePath, "utf8");
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new ConfigError("MALFORMED_JSON", `${basename(absolutePath)} is not valid JSON.`);
  }
  try {
    return parseSessionFile(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid schema";
    throw new ConfigError("SCHEMA_INVALID", `${basename(absolutePath)} failed analysis schema validation: ${message}`);
  }
}

function loadOneFile(absolutePath: string): LoadedAnalysisFile {
  if (!existsSync(absolutePath)) {
    throw new ConfigError("PATH_NOT_FOUND", `Analysis path not found: ${absolutePath}`);
  }
  if (!statSync(absolutePath).isFile()) {
    throw new ConfigError("UNSUPPORTED_PATH", `Expected a .barnes.json file: ${absolutePath}`);
  }
  if (!isBarnesJsonName(absolutePath)) {
    throw new ConfigError(
      "UNSUPPORTED_FILE",
      `Only .barnes.json analysis exports are accepted. Rejected: ${basename(absolutePath)}`,
    );
  }
  const session = readValidatedSession(absolutePath);
  return {
    analysisId: session.id,
    fileName: basename(absolutePath),
    absolutePath,
    session,
  };
}

function loadDirectory(absolutePath: string): LoadedAnalysisFile[] {
  const names = readdirSync(absolutePath);
  const loaded: LoadedAnalysisFile[] = [];
  const seen = new Map<string, string>();

  for (const name of names) {
    const child = resolve(absolutePath, name);
    let stats;
    try {
      stats = statSync(child);
    } catch {
      continue;
    }
    if (!stats.isFile()) continue;
    if (!isBarnesJsonName(name)) continue;
    try {
      const file = loadOneFile(child);
      const previous = seen.get(file.analysisId);
      if (previous) {
        throw new ConfigError(
          "DUPLICATE_SESSION_ID",
          `Duplicate analysis id "${file.analysisId}" in ${previous} and ${file.fileName}.`,
        );
      }
      seen.set(file.analysisId, file.fileName);
      loaded.push(file);
    } catch (error) {
      if (error instanceof ConfigError && error.code === "DUPLICATE_SESSION_ID") {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      logError(`Skipping ${name}: ${message}`);
    }
  }

  if (loaded.length === 0) {
    throw new ConfigError(
      "NO_VALID_ANALYSES",
      `No valid .barnes.json analyses found in ${absolutePath}.`,
    );
  }
  return loaded;
}

export function loadAnalysesFromPath(analysisPath: string): LoadedAnalysisFile[] {
  if (!existsSync(analysisPath)) {
    throw new ConfigError("PATH_NOT_FOUND", `Analysis path not found: ${analysisPath}`);
  }
  const stats = statSync(analysisPath);
  if (stats.isFile()) {
    return [loadOneFile(analysisPath)];
  }
  if (stats.isDirectory()) {
    return loadDirectory(analysisPath);
  }
  throw new ConfigError("UNSUPPORTED_PATH", `Unsupported analysis path: ${analysisPath}`);
}
