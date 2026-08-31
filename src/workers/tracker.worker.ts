import { pixelwiseMedian, rgbaToGray, type GrayImage } from "../domain/image";
import { trackFrame, type TrackerMemory } from "../domain/tracking";
import type { ArenaGeometry, TrackingParameters, TrackingSample } from "../domain/types";

type InitMessage = {
  type: "init";
  width: number;
  height: number;
  scale: number;
  arena: ArenaGeometry;
  parameters: TrackingParameters;
};

type BackgroundMessage = {
  type: "background";
  frames: ArrayBuffer[];
  width: number;
  height: number;
};

type FrameMessage = {
  type: "frame";
  pixels: ArrayBuffer;
  width: number;
  height: number;
  timestampSeconds: number;
  frameIndex?: number;
};

type ResetMessage = { type: "reset" };

type Incoming = InitMessage | BackgroundMessage | FrameMessage | ResetMessage;

let arena: ArenaGeometry | null = null;
let parameters: TrackingParameters | null = null;
let background: GrayImage | null = null;
let memory: TrackerMemory = {};
let scale = 1;

function grayFromBuffer(buffer: ArrayBuffer, width: number, height: number): GrayImage {
  const bytes = new Uint8ClampedArray(buffer);
  if (bytes.length === width * height) {
    return { width, height, data: bytes };
  }
  return rgbaToGray(bytes, width, height);
}

self.onmessage = (event: MessageEvent<Incoming>) => {
  const message = event.data;
  try {
    if (message.type === "reset") {
      arena = null;
      parameters = null;
      background = null;
      memory = {};
      return;
    }
    if (message.type === "init") {
      arena = message.arena;
      parameters = message.parameters;
      scale = message.scale;
      memory = {};
      self.postMessage({ type: "ready" });
      return;
    }
    if (message.type === "background") {
      const frames = message.frames.map((buffer) => grayFromBuffer(buffer, message.width, message.height));
      background = pixelwiseMedian(frames);
      self.postMessage({ type: "background-ready" });
      return;
    }
    if (message.type === "frame") {
      if (!arena || !parameters || !background) {
        throw new Error("Tracker worker received a frame before initialization.");
      }
      const frame = grayFromBuffer(message.pixels, message.width, message.height);
      const result = trackFrame({
        frame,
        background,
        arena,
        parameters,
        timestampSeconds: message.timestampSeconds,
        frameIndex: message.frameIndex,
        memory,
        scale,
      });
      memory = result.memory;
      const sample: TrackingSample = result.sample;
      self.postMessage({ type: "sample", sample });
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Tracking worker failed.",
    });
  }
};
