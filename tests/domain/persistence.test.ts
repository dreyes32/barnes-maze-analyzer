import { describe, expect, it } from "vitest";
import { parseSessionFile } from "../../src/domain/schemas";
import { buildExampleSession } from "../../src/demo/buildExampleSession";
import { sessionToPortableJson, parsePortableSession } from "../../src/export/analysisJson";

describe("session persistence", () => {
  it("round-trips an example session through JSON and Zod", () => {
    const session = buildExampleSession();
    const text = sessionToPortableJson(session);
    const parsed = parsePortableSession(text);
    expect(parsed.schemaVersion).toBe(session.schemaVersion);
    expect(parsed.trials).toHaveLength(session.trials.length);
    expect(parsed.trials[0].corrections).toEqual(session.trials[0].corrections);
  });

  it("rejects an incompatible schema", () => {
    const session = buildExampleSession();
    expect(() => parseSessionFile({ ...session, schemaVersion: 99 })).toThrow(/newer than this application/);
  });

  it("keeps a correction through serialization", () => {
    const session = buildExampleSession();
    session.trials[0].corrections.push({
      id: "c1",
      timestampSeconds: 1.2,
      kind: "body-position",
      previousValue: { x: 1, y: 1 },
      correctedValue: { x: 8, y: 9 },
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const parsed = parsePortableSession(sessionToPortableJson(session));
    expect(parsed.trials[0].corrections[0]?.kind).toBe("body-position");
    expect(parsed.trials[0].corrections[0]?.correctedValue).toEqual({ x: 8, y: 9 });
  });
});
