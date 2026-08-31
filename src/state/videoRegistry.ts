const files = new Map<string, File>();
const urls = new Map<string, string>();

export function registerVideoFile(trialId: string, file: File): string {
  files.set(trialId, file);
  const existing = urls.get(trialId);
  if (existing) URL.revokeObjectURL(existing);
  const url = URL.createObjectURL(file);
  urls.set(trialId, url);
  return url;
}

export function getVideoFile(trialId: string): File | undefined {
  return files.get(trialId);
}

export function getVideoUrl(trialId: string): string | undefined {
  return urls.get(trialId);
}

export function forgetVideo(trialId: string): void {
  files.delete(trialId);
  const url = urls.get(trialId);
  if (url) URL.revokeObjectURL(url);
  urls.delete(trialId);
}

export function hasVideo(trialId: string): boolean {
  return files.has(trialId);
}
