/**
 * In-process MCP smoke (no Vitest workers). Used when the local Node helper
 * cannot collect Vitest suites. CI still runs `npm run mcp:test`.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { AnalysisCatalog } from "../src/catalog";
import { ConfigError, parseRuntimeConfig } from "../src/config";
import { sanitizeExportFileName, writeTrialSummaryCsv } from "../src/io/exportCsv";
import { loadAnalysesFromPath } from "../src/io/loadAnalysis";
import { describeNumbers } from "../src/queries/aggregates";
import { buildCohortSummaries } from "../src/queries/cohortSummary";
import { listAnalyses } from "../src/queries/listAnalyses";
import { buildReviewIssueRows } from "../src/queries/reviewSummary";
import { buildStrategySummary } from "../src/queries/strategySummary";
import { buildTrialSummary, toListedTrial } from "../src/queries/trialSummary";
import { createBarnesMcpServer } from "../src/server";
import { TRIAL_SUMMARY_COLUMNS } from "../../src/export/csv";
import { parseSessionFile } from "../../src/domain/schemas";
import {
  controlTreatmentSession,
  makeSession,
  makeTrial,
  writeSession,
} from "../tests/fixtures";

const failures: string[] = [];

function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.error(`ok  ${name}`);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${name}: ${message}`);
      console.error(`fail  ${name}`);
      console.error(`      ${message}`);
    });
}

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function catalogOf(...sessions: ReturnType<typeof makeSession>[]) {
  return new AnalysisCatalog(
    sessions.map((session) => ({
      analysisId: session.id,
      fileName: `${session.id}.barnes.json`,
      absolutePath: `/tmp/${session.id}.barnes.json`,
      session,
    })),
  );
}

await check("aggregates exclude null and keep 0", () => {
  assert.deepEqual(describeNumbers([10, 20, null, 30]), {
    count: 3,
    mean: 20,
    median: 20,
    min: 10,
    max: 30,
  });
  assert.deepEqual(describeNumbers([0, 2]), {
    count: 2,
    mean: 1,
    median: 1,
    min: 0,
    max: 2,
  });
});

await check("sample fixture validates with the app schema", () => {
  const raw = JSON.parse(readFileSync(new URL("../fixtures/sample.barnes.json", import.meta.url), "utf8"));
  const session = parseSessionFile(raw);
  assert.equal(session.id, "session-main");
});

await check("load valid file and reject bad inputs", () => {
  const dir = tempDir("barnes-mcp-load-");
  const file = join(dir, "main.barnes.json");
  writeSession(file, controlTreatmentSession);
  const loaded = loadAnalysesFromPath(file);
  assert.equal(loaded[0]?.analysisId, "session-main");

  const badJson = join(dir, "bad.barnes.json");
  writeFileSync(badJson, "{not json", "utf8");
  assert.throws(() => loadAnalysesFromPath(badJson), (error: unknown) => error instanceof ConfigError && error.code === "MALFORMED_JSON");

  const invalid = join(dir, "invalid.barnes.json");
  writeFileSync(invalid, JSON.stringify({ id: "x", name: "nope" }), "utf8");
  assert.throws(() => loadAnalysesFromPath(invalid), (error: unknown) => error instanceof ConfigError && error.code === "SCHEMA_INVALID");

  assert.throws(
    () => loadAnalysesFromPath(join(dir, "missing.barnes.json")),
    (error: unknown) => error instanceof ConfigError && error.code === "PATH_NOT_FOUND",
  );

  const notes = join(dir, "notes.json");
  writeFileSync(notes, "{}", "utf8");
  assert.throws(() => loadAnalysesFromPath(notes), (error: unknown) => error instanceof ConfigError && error.code === "UNSUPPORTED_FILE");
});

await check("directory load skips invalid files and does not recurse", () => {
  const dir = tempDir("barnes-mcp-dir-");
  writeSession(join(dir, "ok.barnes.json"), controlTreatmentSession);
  writeFileSync(join(dir, "skip.txt"), "hello", "utf8");
  writeFileSync(join(dir, "broken.barnes.json"), "{", "utf8");
  writeSession(
    join(dir, "second.barnes.json"),
    makeSession({
      id: "session-second",
      name: "Second",
      trials: [makeTrial({ id: "extra", fileName: "x.mp4", cohort: "B" })],
    }),
  );
  const loaded = loadAnalysesFromPath(dir);
  assert.deepEqual(loaded.map((item) => item.analysisId).sort(), ["session-main", "session-second"]);

  const empty = tempDir("barnes-mcp-empty-");
  mkdirSync(join(empty, "nested"));
  writeSession(join(empty, "nested", "hidden.barnes.json"), controlTreatmentSession);
  assert.throws(
    () => loadAnalysesFromPath(empty),
    (error: unknown) => error instanceof ConfigError && error.code === "NO_VALID_ANALYSES",
  );
});

await check("list_analyses and list_trials filters", () => {
  const catalog = catalogOf(controlTreatmentSession);
  const listed = listAnalyses(catalog);
  assert.equal(listed[0]?.trialCount, 5);
  assert.deepEqual(listed[0]?.cohorts, ["Control", "Treatment"]);
  const all = catalog.listTrials();
  assert.ok(Array.isArray(all) && all.length === 5);
  const control = catalog.listTrials({ cohort: "control" });
  assert.ok(Array.isArray(control) && control.length === 4);
  const day = catalog.listTrials({ day: "2" });
  assert.ok(Array.isArray(day) && day.length === 4);
  const spatial = catalog.listTrials({ strategy: "spatial" });
  assert.ok(Array.isArray(spatial));
  assert.deepEqual(
    spatial.map((item) => item.trial.id).sort(),
    ["trial-c1", "trial-c2"],
  );
  const review = catalog.listTrials({ needsReview: true });
  assert.ok(Array.isArray(review));
  assert.deepEqual(
    review.map((item) => item.trial.id),
    ["trial-c2"],
  );
  const treatment = catalog.listTrials({ animalId: "M3" });
  assert.ok(Array.isArray(treatment));
  assert.equal(toListedTrial(treatment[0]!).primaryLatencySeconds, null);
});

await check("trial / cohort / strategy / review summaries", () => {
  const catalog = catalogOf(controlTreatmentSession);
  const trial = catalog.findTrial("trial-c2");
  assert.ok("trial" in trial);
  const summary = buildTrialSummary(trial);
  assert.equal(summary.strategy.automatic, "serial");
  assert.equal(summary.strategy.final, "spatial");
  assert.equal(summary.strategy.overridden, true);
  assert.equal(summary.metrics.primaryLatencySeconds, 20);
  const nullTrial = catalog.findTrial("trial-t1");
  assert.ok("trial" in nullTrial);
  assert.equal(buildTrialSummary(nullTrial).metrics.primaryLatencySeconds, null);

  const control = catalog.listTrials({ cohort: "Control" });
  assert.ok(Array.isArray(control));
  const [cohort] = buildCohortSummaries(control, "Control");
  assert.deepEqual(cohort?.metrics.primaryLatencySeconds, {
    count: 3,
    mean: 20,
    median: 20,
    min: 10,
    max: 30,
  });

  const strategy = buildStrategySummary(control, {
    analysisId: "session-main",
    cohort: "Control",
    day: null,
    animalId: null,
  });
  assert.deepEqual(strategy.automaticClassification, { spatial: 1, serial: 1, random: 2, unavailable: 0 });
  assert.deepEqual(strategy.finalClassification, { spatial: 2, serial: 0, random: 2, unavailable: 0 });
  assert.equal(strategy.overrides.overrideCount, 1);

  const issues = buildReviewIssueRows(control, {});
  assert.ok(issues.some((row) => row.trialId === "trial-c2" && row.issueCount > 0));
  assert.ok(!issues.some((row) => row.trialId === "trial-c1"));
});

await check("CSV export is sandboxed and keeps nulls empty", () => {
  const catalog = catalogOf(controlTreatmentSession);
  const trials = catalog.listTrials({ cohort: "Treatment" });
  assert.ok(Array.isArray(trials));
  const dir = tempDir("barnes-export-");
  const written = writeTrialSummaryCsv(trials, dir, "out.csv");
  assert.deepEqual(written.columns, [...TRIAL_SUMMARY_COLUMNS]);
  const text = readFileSync(written.outputPath, "utf8");
  const row = text.trim().split("\n")[1];
  const cells = row?.split(",") ?? [];
  const latencyIndex = TRIAL_SUMMARY_COLUMNS.indexOf("primary_latency_s");
  assert.equal(cells[latencyIndex], "");
  assert.throws(() => sanitizeExportFileName("../../secret.csv"), ConfigError);
  assert.throws(() => sanitizeExportFileName("/tmp/out.csv"), ConfigError);
  assert.throws(() => sanitizeExportFileName("D:/abs.csv"), ConfigError);
  assert.equal(sanitizeExportFileName(undefined, { cohort: "Control", day: "2" }), "barnes-control-day-2-summary.csv");
});

await check("config requires an explicit analysis path", () => {
  assert.throws(() => parseRuntimeConfig([], {}, "/repo"), ConfigError);
  const config = parseRuntimeConfig(["--analysis", "./a.barnes.json"], {}, "/repo");
  assert.match(config.analysisPath.replace(/\\/g, "/"), /a\.barnes\.json$/);
});

await check("in-memory MCP client can call every tool", async () => {
  const catalog = catalogOf(controlTreatmentSession);
  const exportDir = tempDir("barnes-mcp-export-");
  const server = createBarnesMcpServer(catalog, { analysisPath: "/tmp", exportDir });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "smoke", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), [
    "export_summary_csv",
    "get_cohort_summary",
    "get_review_issues",
    "get_strategy_summary",
    "get_trial_summary",
    "list_analyses",
    "list_trials",
  ]);

  const analyses = await client.callTool({ name: "list_analyses", arguments: {} });
  assert.ok(!analyses.isError);
  assert.equal((analyses.structuredContent as { analyses: Array<{ trialCount: number }> }).analyses[0]?.trialCount, 5);

  const trials = await client.callTool({ name: "list_trials", arguments: { cohort: "Control" } });
  assert.equal((trials.structuredContent as { trials: unknown[] }).trials.length, 4);

  const summary = await client.callTool({ name: "get_trial_summary", arguments: { trialId: "trial-c2" } });
  assert.equal((summary.structuredContent as { strategy: { overridden: boolean } }).strategy.overridden, true);

  const strategy = await client.callTool({ name: "get_strategy_summary", arguments: { cohort: "Control" } });
  assert.equal((strategy.structuredContent as { overrides: { overrideCount: number } }).overrides.overrideCount, 1);

  const cohort = await client.callTool({ name: "get_cohort_summary", arguments: { cohort: "Control" } });
  assert.equal(
    (cohort.structuredContent as { cohorts: Array<{ metrics: { primaryLatencySeconds: { mean: number } } }> }).cohorts[0]
      ?.metrics.primaryLatencySeconds.mean,
    20,
  );

  const issues = await client.callTool({ name: "get_review_issues", arguments: { unresolvedOnly: true } });
  assert.deepEqual(
    (issues.structuredContent as { trials: Array<{ trialId: string }> }).trials.map((row) => row.trialId),
    ["trial-c2"],
  );

  const csv = await client.callTool({ name: "export_summary_csv", arguments: { filters: { day: "2" } } });
  assert.equal((csv.structuredContent as { rowCount: number }).rowCount, 4);

  const missing = await client.callTool({ name: "get_trial_summary", arguments: { trialId: "trial_123" } });
  assert.equal(missing.isError, true);
  assert.deepEqual(missing.structuredContent, {
    error: { code: "TRIAL_NOT_FOUND", message: "No trial matched trial_123." },
  });

  const traversal = await client.callTool({
    name: "export_summary_csv",
    arguments: { fileName: "../../etc/passwd.csv" },
  });
  assert.equal(traversal.isError, true);
  assert.equal((traversal.structuredContent as { error: { code: string } }).error.code, "INVALID_FILENAME");

  await client.close();
  await server.close();
});

if (failures.length > 0) {
  console.error(`\n${failures.length} smoke check(s) failed.`);
  process.exitCode = 1;
} else {
  console.error("\nAll MCP smoke checks passed.");
}
