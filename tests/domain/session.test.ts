import { describe, expect, it } from "vitest";
import {
  createEmptySession,
  createTrial,
  createTrialGroup,
  removeTrialFromSession,
  workflowStepCompletion,
} from "../../src/domain/session";
import { parseSessionFile } from "../../src/domain/schemas";
import { sessionToPortableJson, parsePortableSession } from "../../src/export/analysisJson";
import type { VideoSourceMetadata } from "../../src/domain/types";

function source(fileName: string): VideoSourceMetadata {
  return {
    fileName,
    fileSize: 100,
    width: 640,
    height: 480,
    durationSeconds: 10,
    fps: 30,
    sourceFingerprint: `test:${fileName}`,
  };
}

describe("session organization", () => {
  it("removes a trial and clears the current selection when needed", () => {
    const first = createTrial(source("test50.mp4"));
    const second = createTrial(source("test51.mp4"));
    const session = {
      ...createEmptySession(),
      trials: [first, second],
      currentTrialId: first.id,
    };

    const next = removeTrialFromSession(session, first.id);
    expect(next.trials.map((trial) => trial.source.fileName)).toEqual(["test51.mp4"]);
    expect(next.currentTrialId).toBe(second.id);
  });

  it("creates organizational groups without changing trial analysis fields", () => {
    const trial = createTrial(source("test50.mp4"));
    const group = createTrialGroup("Day 1");
    expect(group.name).toBe("Day 1");
    expect(trial.tracking).toBeUndefined();
    expect(trial.metrics).toBeUndefined();
  });

  it("round-trips optional trial groups through .barnes.json", () => {
    const trial = createTrial(source("test50.mp4"));
    const group = createTrialGroup("Control");
    trial.groupId = group.id;
    const session = {
      ...createEmptySession("Grouped session"),
      trials: [trial],
      trialGroups: [group],
      currentTrialId: trial.id,
    };

    const parsed = parsePortableSession(sessionToPortableJson(session));
    expect(parsed.trialGroups).toHaveLength(1);
    expect(parsed.trialGroups?.[0]?.name).toBe("Control");
    expect(parsed.trials[0].groupId).toBe(group.id);
  });

  it("resets workflow completion to the selected trial", () => {
    const finished = createTrial(source("test50.mp4"));
    finished.arena = {
      platformCenterPx: { x: 1, y: 1 },
      platformRadiusPx: 10,
      holeCentersPx: Array.from({ length: 20 }, () => ({ x: 1, y: 1 })),
      holeRadiusPx: 2,
      targetHoleIndex: 0,
      geometrySource: "manual",
    };
    finished.tracking = {
      rawSamples: [{ timestampSeconds: 0, confidence: 1, status: "tracked", source: "automatic" }],
      effectiveSamples: [],
      analysisSamplingHz: 12,
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:00:00.000Z",
    };
    finished.reviewStatus = "complete";
    finished.metrics = { unavailableReasons: [] };

    const fresh = createTrial(source("test51.mp4"));
    expect(workflowStepCompletion(finished)).toEqual({
      videos: true,
      arena: true,
      track: true,
      review: true,
      results: true,
    });
    expect(workflowStepCompletion(fresh)).toEqual({
      videos: true,
      arena: false,
      track: false,
      review: false,
      results: false,
    });
    expect(workflowStepCompletion(undefined)).toEqual({
      videos: false,
      arena: false,
      track: false,
      review: false,
      results: false,
    });
  });

  it("opens older sessions that omit trial groups", () => {
    const session = createEmptySession();
    const { trialGroups: _ignored, ...legacy } = session;
    const parsed = parseSessionFile(legacy);
    expect(parsed.trialGroups).toBeUndefined();
    expect(parsed.trials).toEqual([]);
  });
});
