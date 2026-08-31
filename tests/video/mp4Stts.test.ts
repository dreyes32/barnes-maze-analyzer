import { describe, expect, it } from "vitest";
import { parseMp4Timebase } from "../../src/video/mp4Metadata";

function box(type: string, payload: Uint8Array): Uint8Array {
  const size = 8 + payload.length;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setUint32(0, size);
  out.set(new TextEncoder().encode(type), 4);
  out.set(payload, 8);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value);
  return out;
}

describe("mp4 stts dominant duration", () => {
  it("uses the dominant sample duration when one leftover frame would look like VFR", () => {
    const mdhd = box("mdhd", concat(new Uint8Array(4), u32(0), u32(0), u32(15000), u32(15000)));
    const stts = box(
      "stts",
      concat(u32(0), u32(2), u32(740), u32(1001), u32(1), u32(400)),
    );
    const stbl = box("stbl", stts);
    const minf = box("minf", stbl);
    const mdia = box("mdia", concat(mdhd, minf));
    const trak = box("trak", mdia);
    const moov = box("moov", trak);
    const parsed = parseMp4Timebase(moov.buffer);
    expect(parsed.timebase.isVariableFrameRate).toBe(false);
    expect(parsed.timebase.fps).toBeCloseTo(15000 / 1001);
    expect(parsed.timebase.fps).not.toBe(15);
  });
});
