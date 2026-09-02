import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { AnalysisCatalog } from "./catalog";
import { ConfigError, logError, parseRuntimeConfig } from "./config";
import { loadAnalysesFromPath } from "./io/loadAnalysis";
import { createBarnesMcpServer } from "./server";

function start(): void {
  try {
    const config = parseRuntimeConfig();
    const files = loadAnalysesFromPath(config.analysisPath);
    const catalog = new AnalysisCatalog(files);
    logError(
      `Barnes maze MCP server: loaded ${catalog.entries.length} analysis file(s) from ${config.analysisPath}`,
    );
    for (const entry of catalog.entries) {
      logError(`  ${entry.analysisId} - ${entry.session.name} - ${entry.session.trials.length} trial(s)`);
    }
    logError(`CSV exports will be written under ${config.exportDir}`);
    logError("This server reads completed .barnes.json files only. It does not open video files.");
    void serveStdio(() => createBarnesMcpServer(catalog, config));
  } catch (error) {
    if (error instanceof ConfigError) {
      logError(`${error.code}: ${error.message}`);
    } else {
      logError(error instanceof Error ? error.message : "Failed to start the MCP server.");
    }
    process.exitCode = 1;
  }
}

start();
