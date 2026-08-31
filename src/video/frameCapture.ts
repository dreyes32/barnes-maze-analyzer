import { downsampleGray, rgbaToGray, type GrayImage } from "../domain/image";

export function captureVideoFrame(video: HTMLVideoElement, scale = 1): GrayImage {
  const width = video.videoWidth;
  const height = video.videoHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not create a canvas to read this video frame.");
  ctx.drawImage(video, 0, 0);
  const image = ctx.getImageData(0, 0, width, height);
  const gray = rgbaToGray(image.data, width, height);
  return scale === 1 ? gray : downsampleGray(gray, scale);
}

export function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (Math.abs(video.currentTime - time) < 0.001 && video.readyState >= 2) {
      resolve();
      return;
    }
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("The video could not seek to the requested time."));
    };
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = Math.min(Math.max(0, time), Number.isFinite(video.duration) ? video.duration - 0.001 : time);
  });
}

export async function sampleDistributedTimes(
  video: HTMLVideoElement,
  count: number,
): Promise<number[]> {
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) return [0];
  if (count <= 1) return [0];
  return Array.from({ length: count }, (_, index) => (duration * index) / (count - 1));
}

export function createObjectUrl(file: File): string {
  return URL.createObjectURL(file);
}
