import type { Timebase, VideoSourceMetadata } from "../domain/types";
import { fingerprintFile } from "./fingerprint";
import { parseMp4Timebase } from "./mp4Metadata";

function loadHtmlVideo(file: File): Promise<{ width: number; height: number; durationSeconds: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.src = url;
    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };
    video.onloadedmetadata = () => {
      const result = {
        width: video.videoWidth,
        height: video.videoHeight,
        durationSeconds: Number.isFinite(video.duration) ? video.duration : 0,
      };
      cleanup();
      resolve(result);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error(`Could not read video metadata from ${file.name}. The file may be unsupported or damaged.`));
    };
  });
}

/**
 * Reads the source MP4 into memory to parse moov atoms. Acceptable for the
 * supplied take-home clips; very large recordings would need chunked atom search.
 */
export async function probeVideoFile(file: File): Promise<VideoSourceMetadata> {
  if (!file.type.startsWith("video/") && !file.name.toLowerCase().endsWith(".mp4")) {
    throw new Error(`${file.name} is not a supported video file. Import an MP4 recording.`);
  }

  const sourceFingerprint = await fingerprintFile(file);
  let parsed:
    | {
        timebase: Timebase;
        durationSeconds: number;
        width?: number;
        height?: number;
        frameCount?: number;
      }
    | undefined;
  try {
    const buffer = await file.arrayBuffer();
    parsed = parseMp4Timebase(buffer);
  } catch {
    parsed = undefined;
  }

  let htmlMeta: { width: number; height: number; durationSeconds: number } | undefined;
  if (typeof document !== "undefined") {
    try {
      htmlMeta = await loadHtmlVideo(file);
    } catch (error) {
      if (!parsed) throw error;
    }
  }

  const width = htmlMeta?.width || parsed?.width;
  const height = htmlMeta?.height || parsed?.height;
  if (!width || !height) {
    throw new Error(`Could not determine the resolution of ${file.name}.`);
  }

  const durationSeconds = parsed?.durationSeconds || htmlMeta?.durationSeconds || 0;
  if (durationSeconds <= 0) {
    throw new Error(`Could not determine the duration of ${file.name}.`);
  }

  return {
    fileName: file.name,
    fileSize: file.size,
    lastModified: file.lastModified,
    mimeType: file.type || "video/mp4",
    width,
    height,
    durationSeconds,
    frameCount: parsed?.frameCount,
    fps: parsed?.timebase.fps,
    timebase: parsed?.timebase,
    sourceFingerprint,
  };
}

export const SAMPLE_VIDEO_URLS = {
  test50: "https://raw.githubusercontent.com/salk-airc/rse-takehome-2026/main/data/barnes-maze/test50.mp4",
  test51: "https://raw.githubusercontent.com/salk-airc/rse-takehome-2026/main/data/barnes-maze/test51.mp4",
  test53: "https://raw.githubusercontent.com/salk-airc/rse-takehome-2026/main/data/barnes-maze/test53.mp4",
} as const;
