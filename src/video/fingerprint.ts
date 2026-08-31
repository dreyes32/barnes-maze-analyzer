async function digestHex(buffer: ArrayBuffer): Promise<string> {
  if (crypto?.subtle) {
    const hash = await crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  // Fallback: not cryptographic, only used if SubtleCrypto is unavailable (tests).
  const bytes = new Uint8Array(buffer);
  let h1 = 0x811c9dc5;
  for (const byte of bytes) {
    h1 ^= byte;
    h1 = Math.imul(h1, 0x01000193);
  }
  return `fnv_${(h1 >>> 0).toString(16)}_${bytes.length}`;
}

export async function fingerprintFile(file: File): Promise<string> {
  const headSize = Math.min(file.size, 256 * 1024);
  const tailSize = Math.min(file.size, 256 * 1024);
  const head = await file.slice(0, headSize).arrayBuffer();
  const tail =
    file.size <= headSize ? new ArrayBuffer(0) : await file.slice(file.size - tailSize).arrayBuffer();
  const combined = new Uint8Array(head.byteLength + tail.byteLength + 16);
  combined.set(new Uint8Array(head), 0);
  combined.set(new Uint8Array(tail), head.byteLength);
  const view = new DataView(combined.buffer);
  view.setUint32(combined.length - 8, file.size >>> 0);
  view.setUint32(combined.length - 4, file.size / 2 ** 32);
  const hash = await digestHex(combined.buffer);
  return `v1:${file.size}:${hash}`;
}

export function fingerprintsLikelyMatch(a: string, b: string): boolean {
  return a === b;
}

export function fileMatchesMetadata(
  file: File,
  expected: { fileName: string; fileSize: number; sourceFingerprint?: string },
  actualFingerprint?: string,
): { ok: boolean; reason?: string } {
  if (expected.sourceFingerprint && actualFingerprint && actualFingerprint !== expected.sourceFingerprint) {
    return { ok: false, reason: "The selected file does not match the saved video fingerprint." };
  }
  if (file.size !== expected.fileSize && file.name !== expected.fileName) {
    return {
      ok: false,
      reason: `Expected ${expected.fileName} (${expected.fileSize} bytes). The selected file is ${file.name} (${file.size} bytes).`,
    };
  }
  if (file.size !== expected.fileSize) {
    return {
      ok: false,
      reason: `File size does not match the saved video (${expected.fileSize} bytes vs ${file.size} bytes).`,
    };
  }
  return { ok: true };
}
