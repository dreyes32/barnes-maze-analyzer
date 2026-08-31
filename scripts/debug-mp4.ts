import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMp4Timebase } from "../src/video/mp4Metadata";

for (const name of ["test50.mp4", "test51.mp4", "test53.mp4"]) {
  const bytes = Uint8Array.from(readFileSync(join(process.cwd(), ".local-data", name)));
  try {
    const parsed = parseMp4Timebase(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    console.log(name, parsed.timebase, "duration", parsed.durationSeconds, "frames", parsed.frameCount);
  } catch (error) {
    console.error(name, error);
  }
}
