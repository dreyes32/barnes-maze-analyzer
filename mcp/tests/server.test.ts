import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AnalysisCatalog } from "../src/catalog";
import { createBarnesMcpServer } from "../src/server";
import { controlTreatmentSession } from "./fixtures";

const catalog = new AnalysisCatalog([
  {
    analysisId: controlTreatmentSession.id,
    fileName: "main.barnes.json",
    absolutePath: "/tmp/main.barnes.json",
    session: controlTreatmentSession,
  },
]);

describe("MCP server tools", () => {
  const exportDir = mkdtempSync(join(tmpdir(), "barnes-mcp-export-"));
  let client: Client | undefined;
  let server: ReturnType<typeof createBarnesMcpServer> | undefined;

  afterEach(async () => {
    await client?.close();
    await server?.close();
    client = undefined;
    server = undefined;
  });

  async function connect() {
    server = createBarnesMcpServer(catalog, { analysisPath: "/tmp", exportDir });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test-harness", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return client;
  }

  it("advertises the seven analysis tools", async () => {
    const mcp = await connect();
    const listed = await mcp.listTools();
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
      "export_summary_csv",
      "get_cohort_summary",
      "get_review_issues",
      "get_strategy_summary",
      "get_trial_summary",
      "list_analyses",
      "list_trials",
    ]);
  });

  it("returns structured results for valid calls", async () => {
    const mcp = await connect();
    const analyses = await mcp.callTool({ name: "list_analyses", arguments: {} });
    expect(analyses.isError).toBeFalsy(); // SDK may omit isError on success
    expect(analyses.structuredContent).toMatchObject({
      analyses: [{ analysisId: "session-main", trialCount: 5 }],
    });

    const trials = await mcp.callTool({
      name: "list_trials",
      arguments: { cohort: "Control" },
    });
    expect((trials.structuredContent as { trials: unknown[] }).trials).toHaveLength(4);

    const summary = await mcp.callTool({
      name: "get_trial_summary",
      arguments: { trialId: "trial-c2" },
    });
    expect(summary.structuredContent).toMatchObject({
      trialId: "trial-c2",
      strategy: { automatic: "serial", final: "spatial", overridden: true },
    });

    const strategy = await mcp.callTool({
      name: "get_strategy_summary",
      arguments: { cohort: "Control" },
    });
    expect(strategy.structuredContent).toMatchObject({
      overrides: { overrideCount: 1 },
    });

    const cohort = await mcp.callTool({
      name: "get_cohort_summary",
      arguments: { cohort: "Control" },
    });
    expect(cohort.structuredContent).toMatchObject({
      cohorts: [{ cohort: "Control", metrics: { primaryLatencySeconds: { count: 3, mean: 20 } } }],
    });

    const issues = await mcp.callTool({
      name: "get_review_issues",
      arguments: { unresolvedOnly: true },
    });
    expect((issues.structuredContent as { trials: Array<{ trialId: string }> }).trials.map((row) => row.trialId)).toEqual([
      "trial-c2",
    ]);

    const csv = await mcp.callTool({
      name: "export_summary_csv",
      arguments: { filters: { day: "2" } },
    });
    expect(csv.structuredContent).toMatchObject({ rowCount: 4, fileName: "barnes-day-2-summary.csv" });
  });

  it("returns controlled errors for invalid requests", async () => {
    const mcp = await connect();
    const missing = await mcp.callTool({
      name: "get_trial_summary",
      arguments: { trialId: "trial_123" },
    });
    expect(missing.isError).toBe(true);
    expect(missing.structuredContent).toEqual({
      error: { code: "TRIAL_NOT_FOUND", message: "No trial matched trial_123." },
    });

    const badArgs = await mcp.callTool({
      name: "get_trial_summary",
      arguments: {},
    });
    expect(badArgs.isError).toBe(true);

    const traversal = await mcp.callTool({
      name: "export_summary_csv",
      arguments: { fileName: "../../etc/passwd.csv" },
    });
    expect(traversal.isError).toBe(true);
    expect(traversal.structuredContent).toMatchObject({ error: { code: "INVALID_FILENAME" } });
  });
});
