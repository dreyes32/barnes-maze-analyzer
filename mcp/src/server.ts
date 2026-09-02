import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { AnalysisCatalog } from "./catalog";
import type { McpRuntimeConfig } from "./config";
import { listAnalyses } from "./queries/listAnalyses";
import { buildTrialSummary } from "./queries/trialSummary";
import {
  asMcpSchema,
  compareCohortsArgsSchema,
  cohortReportArgsSchema,
  optionalAnalysisArgsSchema,
} from "./schemas/tools";
import { registerAnalysisTools } from "./tools/registerAll";

export const MCP_SERVER_NAME = "barnes-maze-analyzer";
export const MCP_SERVER_VERSION = "1.0.0";

export function createBarnesMcpServer(catalog: AnalysisCatalog, config: McpRuntimeConfig): McpServer {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  });

  registerAnalysisTools(server, catalog, config);
  registerResources(server, catalog);
  registerPrompts(server);

  return server;
}

function registerResources(server: McpServer, catalog: AnalysisCatalog): void {
  server.registerResource(
    "analysis",
    new ResourceTemplate("barnes://analysis/{analysisId}", {
      list: async () => ({
        resources: listAnalyses(catalog).map((analysis) => ({
          uri: `barnes://analysis/${analysis.analysisId}`,
          name: analysis.name,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      description: "Concise JSON summary of a completed analysis loaded at startup. No video data.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const analysisId = String(variables.analysisId ?? "");
      const analyses = listAnalyses(catalog);
      const analysis = analyses.find((item) => item.analysisId === analysisId);
      if (!analysis) {
        return {
          contents: [
            {
              uri: String(uri),
              mimeType: "application/json",
              text: JSON.stringify({ error: { code: "ANALYSIS_NOT_FOUND", message: analysisId } }),
            },
          ],
        };
      }
      return {
        contents: [{ uri: String(uri), mimeType: "application/json", text: JSON.stringify(analysis, null, 2) }],
      };
    },
  );

  server.registerResource(
    "trial",
    new ResourceTemplate("barnes://analysis/{analysisId}/trial/{trialId}", {
      list: undefined,
    }),
    {
      description: "Concise JSON trial summary. Identifiers come from list_analyses / list_trials, not filesystem paths.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const found = catalog.findTrial(String(variables.trialId ?? ""), String(variables.analysisId ?? ""));
      const body = "code" in found ? { error: found } : buildTrialSummary(found);
      return {
        contents: [{ uri: String(uri), mimeType: "application/json", text: JSON.stringify(body, null, 2) }],
      };
    },
  );
}

function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "compare_cohorts",
    {
      description:
        "Compare Barnes maze behavioral outcomes between two cohorts. Use descriptive statistics only.",
      argsSchema: asMcpSchema(compareCohortsArgsSchema),
    },
    (args) => {
      const { cohortA, cohortB, analysisId } = compareCohortsArgsSchema.parse(args);
      return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Compare Barnes maze outcomes between "${cohortA}" and "${cohortB}".`,
              analysisId ? `Restrict queries to analysisId ${analysisId}.` : "Query the loaded analyses.",
              "Call get_cohort_summary once per cohort and get_strategy_summary once per cohort.",
              "Use descriptive statistics only. Report valid counts. Do not treat null metrics as zero.",
              "Do not claim statistical significance or causal treatment effects.",
              "Mention trials still needing review if get_review_issues reports any.",
            ].join(" "),
          },
        },
      ],
    };
    },
  );

  server.registerPrompt(
    "review_triage",
    {
      description: "Ask which completed trials still need human review.",
      argsSchema: asMcpSchema(optionalAnalysisArgsSchema),
    },
    (args) => {
      const { analysisId } = optionalAnalysisArgsSchema.parse(args);
      return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Which trials still need human review?",
              "Call list_trials with needsReview=true and get_review_issues with unresolvedOnly=true.",
              analysisId ? `Use analysisId ${analysisId}.` : "",
              "Do not correct events, strategy, or tracking. Those remain in the web UI.",
            ]
              .filter(Boolean)
              .join(" "),
          },
        },
      ],
    };
    },
  );

  server.registerPrompt(
    "experiment_summary",
    {
      description: "Draft a descriptive experiment overview from loaded analyses.",
      argsSchema: asMcpSchema(optionalAnalysisArgsSchema),
    },
    (args) => {
      const { analysisId } = optionalAnalysisArgsSchema.parse(args);
      return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Summarize the loaded Barnes maze experiment.",
              "Call list_analyses, get_cohort_summary, get_strategy_summary, and get_review_issues.",
              analysisId ? `Prefer analysisId ${analysisId}.` : "",
              "Distinguish automatic vs final strategy. Distinguish unavailable metrics from zero.",
              "Do not infer treatment effects.",
            ]
              .filter(Boolean)
              .join(" "),
          },
        },
      ],
    };
    },
  );

  server.registerPrompt(
    "cohort_report",
    {
      description:
        "Produce a descriptive cohort report: metrics, strategy mix, and unresolved review counts.",
      argsSchema: asMcpSchema(cohortReportArgsSchema),
    },
    (args) => {
      const { cohort, analysisId } = cohortReportArgsSchema.parse(args);
      return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Write a descriptive report for cohort "${cohort}".`,
              "1. Call get_cohort_summary.",
              "2. Call get_strategy_summary.",
              "3. Call get_review_issues with unresolvedOnly=true.",
              analysisId ? `Use analysisId ${analysisId}.` : "",
              "Distinguish missing values from zeros. Do not make causal or significance claims.",
            ]
              .filter(Boolean)
              .join(" "),
          },
        },
      ],
    };
    },
  );
}
