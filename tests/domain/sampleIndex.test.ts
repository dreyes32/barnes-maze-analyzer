import { describe, expect, it } from "vitest";
import { parseSessionFile } from "../../src/domain/schemas";
import { createEmptySession, createTrial } from "../../src/domain/session";
import { analysisSampleIndexOf, migrateSampleIndex, sourceFrameIndexOf } from "../../src/domain/trackingProvenance";
import { trackingPointsCsv } from "../../src/export/csv";
import type { AnalysisSession, TrackingSample } from "../../src/domain/types";

describe("analysis vs source sample index", () => {
  it("treats legacy frameIndex as the analysis sample index", () => {
    const sample: TrackingSample = {
      timestampSeconds: 0.5,
      frameIndex: 6,
      confidence: 0.8,
      status: "tracked",
      source: "automatic",
      body: { x: 1, y: 2 },
    };
    expect(analysisSampleIndexOf(sample)).toBe(6);
    expect(sourceFrameIndexOf(sample)).toBeUndefined();
    expect(migrateSampleIndex(sample).analysisSampleIndex).toBe(6);
  });

  it("does not invent a source frame index", () => {
    const sample: TrackingSample = {
      timestampSeconds: 1,
      analysisSampleIndex: 12,
      confidence: 0.8,
      status: "tracked",
      source: "automatic",
    };
    expect(sourceFrameIndexOf(sample)).toBeUndefined();
  });

  it("exports analysis_sample_index and leaves source_frame_index empty when unknown", () => {
    const trial = createTrial({
      fileName: "clip.mp4",
      fileSize: 10,
      width: 640,
      height: 480,
      durationSeconds: 1,
      fps: 30,
      sourceFingerprint: "test:sample-index",
    });
    trial.tracking = {
      rawSamples: [
        {
          timestampSeconds: 0,
          analysisSampleIndex: 0,
          body: { x: 1, y: 1 },
          confidence: 1,
          status: "tracked",
          source: "automatic",
        },
      ],
      effectiveSamples: [
        {
          timestampSeconds: 0,
          analysisSampleIndex: 0,
          body: { x: 1, y: 1 },
          confidence: 1,
          status: "tracked",
          source: "automatic",
        },
      ],
      analysisSamplingHz: 12,
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:00:00.000Z",
    };
    const session: AnalysisSession = { ...createEmptySession(), trials: [trial] };
    const csv = trackingPointsCsv(session);
    expect(csv.split("\n")[0]).toContain("analysis_sample_index");
    expect(csv.split("\n")[0].split(",")).not.toContain("frame_index");
    expect(csv.split("\n")[1]).toContain(",0,");
    const header = csv.split("\n")[0].split(",");
    const sourceCol = header.indexOf("source_frame_index");
    expect(csv.split("\n")[1].split(",")[sourceCol]).toBe("");
  });

  it("parses a legacy session that only has frameIndex", () => {
    const session = createEmptySession();
    const trial = createTrial({
      fileName: "legacy.mp4",
      fileSize: 10,
      width: 640,
      height: 480,
      durationSeconds: 1,
      fps: 30,
      sourceFingerprint: "test:legacy-frame",
    });
    trial.tracking = {
      rawSamples: [
        {
          timestampSeconds: 0,
          frameIndex: 3,
          confidence: 1,
          status: "tracked",
          source: "automatic",
          body: { x: 2, y: 2 },
        },
      ],
      effectiveSamples: [
        {
          timestampSeconds: 0,
          frameIndex: 3,
          confidence: 1,
          status: "tracked",
          source: "automatic",
          body: { x: 2, y: 2 },
        },
      ],
      analysisSamplingHz: 12,
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:00:00.000Z",
    };
    session.trials = [trial];
    const parsed = parseSessionFile(JSON.parse(JSON.stringify(session)));
    expect(parsed.trials[0].tracking?.rawSamples[0].frameIndex).toBe(3);
    expect(analysisSampleIndexOf(parsed.trials[0].tracking!.rawSamples[0])).toBe(3);
  });
});
