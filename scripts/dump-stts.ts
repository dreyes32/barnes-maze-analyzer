import { readFileSync } from "node:fs";
import { join } from "node:path";

const bytes = Uint8Array.from(readFileSync(join(process.cwd(), ".local-data", "test51.mp4")));
const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const text = Buffer.from(bytes).toString("latin1");
let idx = 0;
while (true) {
  const at = text.indexOf("stts", idx);
  if (at < 0) break;
  const content = at + 4;
  const entryCount = view.getUint32(content + 4);
  console.log("stts at", at, "entries", entryCount);
  for (let i = 0; i < Math.min(entryCount, 12); i += 1) {
    const count = view.getUint32(content + 8 + i * 8);
    const duration = view.getUint32(content + 12 + i * 8);
    console.log(" ", count, "x", duration);
  }
  idx = at + 4;
}
console.log("mdhd", text.indexOf("mdhd"));
