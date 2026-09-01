import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildExampleSession } from "../src/demo/buildExampleSession";
import { recomputeSession } from "../src/domain/pipeline";
import { eventsCsv, trialSummaryCsv } from "../src/export/csv";
import { parsePortableSession, sessionToPortableJson } from "../src/export/analysisJson";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "examples", "outputs");
mkdirSync(outDir, { recursive: true });

const existingPath = join(outDir, "sample-analysis.barnes.json");
const session = existsSync(existingPath)
  ? recomputeSession(parsePortableSession(readFileSync(existingPath, "utf8")))
  : buildExampleSession();

writeFileSync(join(outDir, "trial_summary.csv"), trialSummaryCsv(session));
writeFileSync(join(outDir, "events.csv"), eventsCsv(session));
writeFileSync(join(outDir, "sample-analysis.barnes.json"), sessionToPortableJson(session));

console.log(`Wrote example outputs for ${session.trials.length} trials to ${outDir}`);
console.log(
  existsSync(existingPath)
    ? "Recomputed the existing sample-analysis.barnes.json through the application pipeline."
    : "These files come from src/demo/buildExampleSession.ts + the same export/domain functions as the app.",
);
