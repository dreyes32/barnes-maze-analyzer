import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildExampleSession } from "../src/demo/buildExampleSession";
import { eventsCsv, trialSummaryCsv } from "../src/export/csv";
import { sessionToPortableJson } from "../src/export/analysisJson";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "examples", "outputs");
mkdirSync(outDir, { recursive: true });

const session = buildExampleSession();
writeFileSync(join(outDir, "trial_summary.csv"), trialSummaryCsv(session));
writeFileSync(join(outDir, "events.csv"), eventsCsv(session));
writeFileSync(join(outDir, "sample-analysis.barnes.json"), sessionToPortableJson(session));

console.log(`Wrote example outputs for ${session.trials.length} trials to ${outDir}`);
console.log("These files come from src/demo/buildExampleSession.ts + the same export/domain functions as the app.");
