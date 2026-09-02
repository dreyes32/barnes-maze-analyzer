# Optional Barnes maze MCP server

Local stdio MCP interface for **completed** `.barnes.json` analysis exports. It does not open video files, re-run tracking, or apply scientific corrections.

```text
Videos → Barnes Maze Analyzer (browser) → .barnes.json → this server → MCP host
```

## Run

From the repository root, after `npm ci`:

```bash
npm run mcp -- --analysis ./mcp/fixtures/sample.barnes.json
```

Directory of completed exports (non-recursive, `.barnes.json` only):

```bash
npm run mcp -- --analysis ./path/to/completed-analyses --export-dir ./mcp-exports
```

Environment fallbacks: `BARNES_ANALYSIS_PATH`, `BARNES_EXPORT_DIR`.

Startup diagnostics go to **stderr**. stdout is reserved for MCP JSON-RPC.

In-process verification (official MCP client + in-memory transport):

```bash
npm run mcp:smoke
```

## MCP Inspector

```bash
npx @modelcontextprotocol/inspector npm run mcp -- --analysis ./mcp/fixtures/sample.barnes.json
```

Connect, then call:

- `list_analyses`
- `list_trials` with `cohort = "Control"`
- `get_trial_summary` with a `trialId` from `list_trials`
- `get_strategy_summary` / `get_cohort_summary` with `cohort = "Control"`
- `get_review_issues` with `unresolvedOnly = true`
- `export_summary_csv` with `filters.day = "2"`

## Client configuration

Development (TypeScript via `tsx`):

```json
{
  "mcpServers": {
    "barnes-maze": {
      "command": "npx",
      "args": [
        "tsx",
        "/absolute/path/to/barnes-maze-analyzer/mcp/src/index.ts",
        "--analysis",
        "/absolute/path/to/analysis.barnes.json"
      ]
    }
  }
}
```

Equivalent after `npm ci` using the repo script:

```json
{
  "mcpServers": {
    "barnes-maze": {
      "command": "npm",
      "args": [
        "run",
        "mcp",
        "--",
        "--analysis",
        "/absolute/path/to/analysis.barnes.json"
      ],
      "cwd": "/absolute/path/to/barnes-maze-analyzer"
    }
  }
}
```

Replace the placeholders with paths on the machine that launches the host. Do not commit machine-specific paths.

## Future extension

The same `createBarnesMcpServer` factory could later be served with Streamable HTTP (`createMcpHandler`). That is not implemented; this release is stdio-only and local.

## Human / agent boundary

The agent may read, filter, compare, and export completed results. Target-hole choice, body/head corrections, escape confirmation, event edits, and strategy overrides stay in the web UI.
