import { mkdirSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

export type McpRuntimeConfig = {
  analysisPath: string;
  exportDir: string;
};

export class ConfigError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ConfigError";
    this.code = code;
  }
}

function readFlag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) {
    throw new ConfigError("INVALID_ARGS", `${name} requires a path argument.`);
  }
  return value;
}

export function parseRuntimeConfig(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): McpRuntimeConfig {
  const analysisRaw = readFlag(argv, "--analysis") ?? env.BARNES_ANALYSIS_PATH;
  if (!analysisRaw || !analysisRaw.trim()) {
    throw new ConfigError(
      "ANALYSIS_PATH_REQUIRED",
      "Set --analysis <file-or-directory> or BARNES_ANALYSIS_PATH to a completed .barnes.json export.",
    );
  }
  const exportRaw = readFlag(argv, "--export-dir") ?? env.BARNES_EXPORT_DIR ?? "mcp-exports";
  return {
    analysisPath: resolve(cwd, analysisRaw),
    exportDir: resolve(cwd, exportRaw),
  };
}

export function ensureExportDir(exportDir: string): string {
  if (!isAbsolute(exportDir)) {
    throw new ConfigError("INVALID_EXPORT_DIR", "Export directory must resolve to an absolute path.");
  }
  mkdirSync(exportDir, { recursive: true });
  return exportDir;
}

export function logError(message: string): void {
  console.error(message);
}
