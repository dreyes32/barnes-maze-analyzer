import type { ArenaGeometry, TrackingParameters, TrackingSample } from "../domain/types";
import TrackerWorker from "./tracker.worker.ts?worker";

export type TrackingProgress = {
  stage: "background" | "tracking";
  current: number;
  total: number;
  timestampSeconds: number;
  trialLabel: string;
};

type WorkerOutgoing =
  | { type: "ready" }
  | { type: "background-ready" }
  | { type: "sample"; sample: TrackingSample }
  | { type: "error"; message: string };

export class TrackerClient {
  private worker: Worker;

  constructor() {
    this.worker = new TrackerWorker();
  }

  dispose(): void {
    this.worker.terminate();
  }

  private once<T extends WorkerOutgoing["type"]>(type: T): Promise<Extract<WorkerOutgoing, { type: T }>> {
    return new Promise((resolve, reject) => {
      const onMessage = (event: MessageEvent<WorkerOutgoing>) => {
        if (event.data.type === "error") {
          this.worker.removeEventListener("message", onMessage);
          reject(new Error(event.data.message));
          return;
        }
        if (event.data.type === type) {
          this.worker.removeEventListener("message", onMessage);
          resolve(event.data as Extract<WorkerOutgoing, { type: T }>);
        }
      };
      this.worker.addEventListener("message", onMessage);
    });
  }

  async init(options: {
    width: number;
    height: number;
    scale: number;
    arena: ArenaGeometry;
    parameters: TrackingParameters;
  }): Promise<void> {
    this.worker.postMessage({ type: "init", ...options });
    await this.once("ready");
  }

  async setBackground(frames: ArrayBuffer[], width: number, height: number): Promise<void> {
    this.worker.postMessage({ type: "background", frames, width, height }, frames);
    await this.once("background-ready");
  }

  trackFrame(options: {
    pixels: ArrayBuffer;
    width: number;
    height: number;
    timestampSeconds: number;
    analysisSampleIndex?: number;
    frameIndex?: number;
  }): Promise<TrackingSample> {
    return new Promise((resolve, reject) => {
      const onMessage = (event: MessageEvent<WorkerOutgoing>) => {
        if (event.data.type === "error") {
          this.worker.removeEventListener("message", onMessage);
          reject(new Error(event.data.message));
          return;
        }
        if (event.data.type === "sample") {
          this.worker.removeEventListener("message", onMessage);
          resolve(event.data.sample);
        }
      };
      this.worker.addEventListener("message", onMessage);
      this.worker.postMessage({ type: "frame", ...options }, [options.pixels]);
    });
  }
}
