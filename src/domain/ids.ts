export function createId(prefix = "id"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 12)}_${Date.now().toString(36)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
