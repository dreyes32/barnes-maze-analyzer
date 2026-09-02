import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError } from "../src/config";
import { loadAnalysesFromPath } from "../src/io/loadAnalysis";
import { controlTreatmentSession, makeSession, makeTrial, writeSession } from "./fixtures";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "barnes-mcp-"));
}

describe("loadAnalysesFromPath", () => {
  it("loads a valid .barnes.json file", () => {
    const dir = tempDir();
    const file = join(dir, "main.barnes.json");
    writeSession(file, controlTreatmentSession);
    const loaded = loadAnalysesFromPath(file);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.analysisId).toBe("session-main");
    expect(loaded[0]?.session.trials).toHaveLength(5);
  });

  it("rejects malformed JSON", () => {
    const file = join(tempDir(), "bad.barnes.json");
    writeFileSync(file, "{not json", "utf8");
    expect(() => loadAnalysesFromPath(file)).toThrow(ConfigError);
    try {
      loadAnalysesFromPath(file);
    } catch (error) {
      expect(error).toMatchObject({ code: "MALFORMED_JSON" });
    }
  });

  it("rejects schema-invalid analysis", () => {
    const file = join(tempDir(), "invalid.barnes.json");
    writeFileSync(file, JSON.stringify({ id: "x", name: "nope" }), "utf8");
    try {
      loadAnalysesFromPath(file);
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ code: "SCHEMA_INVALID" });
    }
  });

  it("rejects a missing path", () => {
    try {
      loadAnalysesFromPath(join(tempDir(), "missing.barnes.json"));
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ code: "PATH_NOT_FOUND" });
    }
  });

  it("rejects an unsupported extension", () => {
    const file = join(tempDir(), "notes.json");
    writeFileSync(file, "{}", "utf8");
    try {
      loadAnalysesFromPath(file);
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ code: "UNSUPPORTED_FILE" });
    }
  });

  it("loads a directory of mixed valid and invalid files", () => {
    const dir = tempDir();
    writeSession(join(dir, "ok.barnes.json"), controlTreatmentSession);
    writeFileSync(join(dir, "skip.txt"), "hello", "utf8");
    writeFileSync(join(dir, "broken.barnes.json"), "{", "utf8");
    writeSession(
      join(dir, "second.barnes.json"),
      makeSession({
        id: "session-second",
        name: "Second",
        trials: [makeTrial({ id: "extra", fileName: "x.mp4", cohort: "B" })],
      }),
    );
    const loaded = loadAnalysesFromPath(dir);
    expect(loaded.map((item) => item.analysisId).sort()).toEqual(["session-main", "session-second"]);
  });

  it("rejects duplicate session IDs in a directory", () => {
    const dir = tempDir();
    writeSession(join(dir, "a.barnes.json"), controlTreatmentSession);
    writeSession(join(dir, "b.barnes.json"), { ...controlTreatmentSession, name: "Copy" });
    try {
      loadAnalysesFromPath(dir);
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ code: "DUPLICATE_SESSION_ID" });
    }
  });

  it("does not recurse into nested directories", () => {
    const dir = tempDir();
    const nested = join(dir, "nested");
    mkdirSync(nested);
    writeSession(join(nested, "hidden.barnes.json"), controlTreatmentSession);
    try {
      loadAnalysesFromPath(dir);
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ code: "NO_VALID_ANALYSES" });
    }
  });
});
