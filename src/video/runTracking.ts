import { nowIso } from "../domain/ids";
import type { AnalysisParameters, ArenaGeometry, TrackingResult, TrackingSample } from "../domain/types";
import { captureVideoFrame, sampleDistributedTimes, seekVideo } from "./frameCapture";
import { TrackerClient, type TrackingProgress } from "../workers/trackerClient";

export async function runTrackingOnVideo(options: {
  video: HTMLVideoElement;
  arena: ArenaGeometry;
  parameters: AnalysisParameters;
  trialLabel: string;
  signal?: AbortSignal;
  onProgress?: (progress: TrackingProgress) => void;
}): Promise<TrackingResult> {
  const { video, arena, parameters, trialLabel, signal, onProgress } = options;
  const startedAt = nowIso();
  const scale = 0.5;
  const client = new TrackerClient();
  const samples: TrackingSample[] = [];

  const throwIfAborted = () => {
    if (signal?.aborted) {
      const error = new Error("Tracking cancelled.");
      error.name = "AbortError";
      throw error;
    }
  };

  try {
    await client.init({
      width: Math.round(video.videoWidth * scale),
      height: Math.round(video.videoHeight * scale),
      scale,
      arena,
      parameters: parameters.tracking,
    });

    const backgroundTimes = await sampleDistributedTimes(video, parameters.tracking.backgroundFrameCount);
    const backgroundFrames: ArrayBuffer[] = [];
    for (const [index, time] of backgroundTimes.entries()) {
      throwIfAborted();
      await seekVideo(video, time);
      const frame = captureVideoFrame(video, scale);
      backgroundFrames.push(frame.data.buffer.slice(0));
      onProgress?.({
        stage: "background",
        current: index + 1,
        total: backgroundTimes.length,
        timestampSeconds: time,
        trialLabel,
      });
    }
    const first = captureVideoFrame(video, scale);
    await client.setBackground(backgroundFrames, first.width, first.height);

    const duration = video.duration;
    const targetHz = parameters.sampling.targetObservationsPerSecond;
    const step = 1 / targetHz;
    const times: number[] = [];
    for (let t = 0; t < duration; t += step) times.push(t);
    if (times.length === 0 || duration - times[times.length - 1] > step * 0.4) {
      times.push(Math.max(0, duration - 1 / 60));
    }

    for (const [index, time] of times.entries()) {
      throwIfAborted();
      await seekVideo(video, time);
      const mediaTime = video.currentTime;
      const frame = captureVideoFrame(video, scale);
      const sample = await client.trackFrame({
        pixels: frame.data.buffer.slice(0),
        width: frame.width,
        height: frame.height,
        timestampSeconds: mediaTime,
        frameIndex: index,
      });
      samples.push(sample);
      onProgress?.({
        stage: "tracking",
        current: index + 1,
        total: times.length,
        timestampSeconds: mediaTime,
        trialLabel,
      });
    }

    return {
      rawSamples: samples,
      effectiveSamples: samples,
      analysisSamplingHz: targetHz,
      startedAt,
      finishedAt: nowIso(),
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        rawSamples: samples,
        effectiveSamples: samples,
        analysisSamplingHz: parameters.sampling.targetObservationsPerSecond,
        startedAt,
        finishedAt: nowIso(),
        cancelled: true,
      };
    }
    throw error;
  } finally {
    client.dispose();
  }
}
