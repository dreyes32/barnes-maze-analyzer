import type { Timebase, VideoSourceMetadata } from "../domain/types";
import { describeTimebase, timebaseFromRational } from "../domain/timebase";

type Box = {
  type: string;
  start: number;
  size: number;
  contentStart: number;
};

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset);
}

function readU64(view: DataView, offset: number): number {
  const high = view.getUint32(offset);
  const low = view.getUint32(offset + 4);
  return high * 2 ** 32 + low;
}

function readType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function iterateBoxes(bytes: Uint8Array, start: number, end: number): Box[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxes: Box[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = readU32(view, offset);
    const type = readType(bytes, offset + 4);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) break;
      size = readU64(view, offset + 8);
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header) break;
    boxes.push({ type, start: offset, size, contentStart: offset + header });
    offset += size;
  }
  return boxes;
}

function findBoxes(bytes: Uint8Array, types: string[], start = 0, end = bytes.length): Box[] {
  const found: Box[] = [];
  const walk = (from: number, to: number) => {
    for (const box of iterateBoxes(bytes, from, to)) {
      if (types.includes(box.type)) found.push(box);
      if (["moov", "trak", "mdia", "minf", "stbl"].includes(box.type)) {
        walk(box.contentStart, box.start + box.size);
      }
    }
  };
  walk(start, end);
  return found;
}

function handlerType(bytes: Uint8Array, hdlr: Box): string {
  return readType(bytes, hdlr.contentStart + 8);
}

function selectVideoTrackBoxes(bytes: Uint8Array): {
  mdhd?: Box;
  stts?: Box;
  tkhd?: Box;
} {
  const tracks = findBoxes(bytes, ["trak"]);
  const parsed = tracks.map((trak) => {
    const end = trak.start + trak.size;
    const hdlr = findBoxes(bytes, ["hdlr"], trak.contentStart, end)[0];
    return {
      handler: hdlr ? handlerType(bytes, hdlr) : undefined,
      mdhd: findBoxes(bytes, ["mdhd"], trak.contentStart, end)[0],
      stts: findBoxes(bytes, ["stts"], trak.contentStart, end)[0],
      tkhd: findBoxes(bytes, ["tkhd"], trak.contentStart, end)[0],
    };
  });
  const video = parsed.find((track) => track.handler === "vide") ?? parsed[0];
  return video ?? {};
}

export function parseMp4Timebase(buffer: ArrayBuffer): {
  timebase: Timebase;
  durationSeconds: number;
  width?: number;
  height?: number;
  frameCount?: number;
} {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const track = selectVideoTrackBoxes(bytes);
  const mdhdBoxes = track.mdhd ? [track.mdhd] : findBoxes(bytes, ["mdhd"]);
  const mvhdBoxes = findBoxes(bytes, ["mvhd"]);
  const sttsBoxes = track.stts ? [track.stts] : findBoxes(bytes, ["stts"]);
  const tkhdBoxes = track.tkhd ? [track.tkhd] : findBoxes(bytes, ["tkhd"]);

  const parseHd = (box: Box) => {
    const version = bytes[box.contentStart];
    if (version === 1) {
      return {
        timescale: readU32(view, box.contentStart + 20),
        duration: readU64(view, box.contentStart + 24),
      };
    }
    return {
      timescale: readU32(view, box.contentStart + 12),
      duration: readU32(view, box.contentStart + 16),
    };
  };

  const mdhd = mdhdBoxes[0] ? parseHd(mdhdBoxes[0]) : undefined;
  const mvhd = mvhdBoxes[0] ? parseHd(mvhdBoxes[0]) : undefined;
  const timescale = mdhd?.timescale ?? mvhd?.timescale;
  const durationUnits = mdhd?.duration ?? mvhd?.duration;
  if (!timescale || timescale <= 0) {
    throw new Error("Could not read an MP4 timescale from this file.");
  }
  const durationSeconds = durationUnits ? durationUnits / timescale : 0;

  let frameCount: number | undefined;
  let isVariableFrameRate = false;
  let frameDurationTimescaleUnits: number | undefined;

  if (sttsBoxes[0]) {
    const entryCount = readU32(view, sttsBoxes[0].contentStart + 4);
    let total = 0;
    const durationCounts = new Map<number, number>();
    let offset = sttsBoxes[0].contentStart + 8;
    for (let i = 0; i < entryCount && offset + 8 <= bytes.length; i += 1) {
      const sampleCount = readU32(view, offset);
      const sampleDuration = readU32(view, offset + 4);
      total += sampleCount;
      durationCounts.set(sampleDuration, (durationCounts.get(sampleDuration) ?? 0) + sampleCount);
      offset += 8;
    }
    frameCount = total || undefined;
    const ranked = [...durationCounts.entries()].sort((a, b) => b[1] - a[1]);
    const dominant = ranked[0];
    // Report the modal sample duration as the nominal fps even when a few
    // composition/edit samples exist. Those leftovers can make
    // frameCount/duration look like 15.005 when the file is 15000/1001.
    if (dominant) {
      frameDurationTimescaleUnits = dominant[0];
    }
    isVariableFrameRate = !dominant || dominant[1] / Math.max(total, 1) < 0.95;
  }

  let width: number | undefined;
  let height: number | undefined;
  if (tkhdBoxes[0]) {
    const version = bytes[tkhdBoxes[0].contentStart];
    const widthOffset = version === 1 ? tkhdBoxes[0].contentStart + 88 : tkhdBoxes[0].contentStart + 76;
    width = readU32(view, widthOffset) / 65536;
    height = readU32(view, widthOffset + 4) / 65536;
  }

  const fps = frameDurationTimescaleUnits
    ? timescale / frameDurationTimescaleUnits
    : frameCount && durationSeconds
      ? frameCount / durationSeconds
      : timescale > 1000
        ? timescale / 1000
        : timescale;

  return {
    timebase: timebaseFromRational({
      timescale,
      frameDurationTimescaleUnits,
      fps,
      isVariableFrameRate,
      source: frameDurationTimescaleUnits ? "mp4-stts" : "mp4-mdhd",
    }),
    durationSeconds,
    width,
    height,
    frameCount,
  };
}

export function describeVideoTiming(meta: VideoSourceMetadata): string {
  if (!meta.timebase) {
    return meta.fps ? `${meta.fps.toFixed(3)} fps (HTML video element)` : "timing unknown";
  }
  return describeTimebase(meta.timebase);
}
