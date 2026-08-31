import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createAssistedArena, generateHoleRing } from "../src/domain/geometry";
import { darkestLocalCenter, downsampleGray, estimateBrightCircle, pixelwiseMedian, type GrayImage } from "../src/domain/image";
import { trackFrame, type TrackerMemory } from "../src/domain/tracking";
import { DEFAULT_PARAMETERS, cloneParameters } from "../src/domain/defaults";
import { createId, nowIso } from "../src/domain/ids";
import { recomputeTrial } from "../src/domain/pipeline";
import { SCHEMA_VERSION, type AnalysisSession, type TrackingSample, type TrialRecord } from "../src/domain/types";
import { eventsCsv, trialSummaryCsv } from "../src/export/csv";
import { sessionToPortableJson } from "../src/export/analysisJson";
import { sessionToWorkbookBuffer } from "../src/export/xlsx";
import { parseMp4Timebase } from "../src/video/mp4Metadata";

const root = join(process.cwd(), ".local-data", "frames-raw");
const videoDir = join(process.cwd(), ".local-data");
const outDir = join(process.cwd(), "examples", "outputs");
const reviewedTargets = JSON.parse(
  readFileSync(join(process.cwd(), "scripts", "reviewed-targets.json"), "utf8"),
) as { targets: Record<string, number> };

function loadGray(path: string, width: number, height: number): GrayImage {
  const data = new Uint8ClampedArray(readFileSync(path));
  if (data.length !== width * height) {
    throw new Error(`${path} has ${data.length} bytes, expected ${width * height}.`);
  }
  return { width, height, data };
}

function arenaFromFrame(frame: GrayImage, targetHoleIndex: number) {
  const circle = estimateBrightCircle(frame);
  if (!circle) throw new Error("Could not estimate the platform circle.");
  const firstHole = darkestLocalCenter(frame, { x: circle.x + circle.radius * 0.82, y: circle.y }, 22, 7);
  const holes = generateHoleRing({
    center: { x: circle.x, y: circle.y },
    hole: { x: firstHole.x, y: firstHole.y },
  }).map((hole) => {
    const refined = darkestLocalCenter(frame, hole, 12, 6);
    return { x: refined.x, y: refined.y };
  });
  const arena = createAssistedArena({
    platformCenterPx: { x: circle.x, y: circle.y },
    platformEdgePx: { x: circle.x + circle.radius, y: circle.y },
    firstHolePx: holes[0],
    targetHoleIndex,
  });
  return {
    ...arena,
    holeCentersPx: holes,
    holeSources: holes.map(() => "refined" as const),
    platformDiameterCm: 91,
    geometrySource: "assisted" as const,
  };
}

function analyzeFolder(name: string): TrialRecord {
  const dir = join(root, name);
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as {
    fileName: string;
    width: number;
    height: number;
    sourceFps: number;
    sourceFrameCount: number;
    timestamps: number[];
    fileSize: number;
  };
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".bin"))
    .sort();

  let fps = manifest.sourceFps;
  let timebase = {
    timescale: 30000,
    frameDurationTimescaleUnits: 1000,
    fps,
    isVariableFrameRate: false,
    source: "mp4-stts" as const,
  };
  try {
    const bytes = Uint8Array.from(readFileSync(join(videoDir, manifest.fileName)));
    const parsed = parseMp4Timebase(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    fps = parsed.timebase.fps;
    timebase = parsed.timebase;
  } catch (error) {
    console.warn(`  MP4 timebase parse failed for ${manifest.fileName}:`, error);
  }

  const scale = 0.5;
  const pickFull = (index: number) => loadGray(join(dir, files[index]), manifest.width, manifest.height);
  const pick = (index: number) => downsampleGray(pickFull(index), scale);
  const backgroundCount = Math.min(24, files.length);
  const background = pixelwiseMedian(
    Array.from({ length: backgroundCount }, (_, index) =>
      pick(Math.round((index * (files.length - 1)) / Math.max(backgroundCount - 1, 1))),
    ),
  );
  const target1 = reviewedTargets.targets[name];
  if (target1 === undefined) {
    throw new Error(`No reviewed target hole for ${name}. Inspect the video and add it to scripts/reviewed-targets.json.`);
  }
  const arena = arenaFromFrame(pickFull(0), target1 - 1);
  console.log(
    `  arena center=${arena.platformCenterPx.x.toFixed(1)},${arena.platformCenterPx.y.toFixed(1)} r=${arena.platformRadiusPx.toFixed(1)} target=hole ${target1}`,
  );
  let memory: TrackerMemory = {};
  const rawSamples: TrackingSample[] = files.map((file, index) => {
    const result = trackFrame({
      frame: downsampleGray(loadGray(join(dir, file), manifest.width, manifest.height), scale),
      background,
      arena,
      parameters: DEFAULT_PARAMETERS.tracking,
      timestampSeconds: manifest.timestamps[index] ?? index / 12,
      frameIndex: index,
      memory,
      scale,
    });
    memory = result.memory;
    if (index % 200 === 0) console.log(`  ${manifest.fileName} ${index}/${files.length}`);
    return result.sample;
  });

  const trial: TrialRecord = {
    id: createId("trial"),
    source: {
      fileName: manifest.fileName,
      fileSize: manifest.fileSize,
      width: manifest.width,
      height: manifest.height,
      durationSeconds: timebase.fps && files.length ? (manifest.sourceFrameCount - 1) / timebase.fps : (manifest.timestamps.at(-1) ?? 0),
      frameCount: manifest.sourceFrameCount,
      fps: timebase.fps,
      timebase,
      sourceFingerprint: `local-extract:${manifest.fileName}:${manifest.fileSize}`,
    },
    experimentMetadata: {
      notes: "Tracked offline from extracted frames using the same domain tracker as the browser app.",
    },
    arena,
    tracking: {
      rawSamples,
      effectiveSamples: rawSamples,
      analysisSamplingHz: files.length / Math.max(manifest.timestamps.at(-1) ?? 1, 1),
      startedAt: nowIso(),
      finishedAt: nowIso(),
    },
    corrections: [],
    events: [],
    reviewStatus: "needs-review",
  };
  return recomputeTrial(trial, DEFAULT_PARAMETERS);
}

const names = readdirSync(root).filter((name) => !name.includes("."));
const trials = names.map((name) => {
  console.log(`Analyzing ${name}`);
  return analyzeFolder(name);
});
const session: AnalysisSession = {
  id: "sample-outputs",
  name: "Salk sample videos",
  schemaVersion: SCHEMA_VERSION,
  appVersion: "1.0.0",
  createdAt: nowIso(),
  updatedAt: nowIso(),
  parameters: cloneParameters(DEFAULT_PARAMETERS),
  trials,
  currentStage: "results",
  currentTrialId: trials[0]?.id,
};

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "trial_summary.csv"), trialSummaryCsv(session));
writeFileSync(join(outDir, "events.csv"), eventsCsv(session));
writeFileSync(join(outDir, "sample-analysis.barnes.json"), sessionToPortableJson(session));
try {
  const workbook = await sessionToWorkbookBuffer(session);
  writeFileSync(join(outDir, "barnes-maze-sample-results.xlsx"), Buffer.from(workbook));
} catch (error) {
  console.warn("XLSX write skipped:", error);
}
console.log(
  trials
    .map(
      (trial) =>
        `${trial.source.fileName} fps=${trial.source.fps?.toFixed(5)} coverage=${trial.qc?.trackingCoveragePercent.toFixed(1)}% events=${trial.events.length} primary=${trial.metrics?.primaryLatencySeconds ?? "NA"}`,
    )
    .join("\n"),
);
