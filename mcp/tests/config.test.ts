import { describe, expect, it } from "vitest";
import { ConfigError, parseRuntimeConfig } from "../src/config";
import { sanitizeExportFileName } from "../src/io/exportCsv";

describe("parseRuntimeConfig", () => {
  it("requires an explicit analysis path", () => {
    expect(() => parseRuntimeConfig([], {}, "/repo")).toThrow(ConfigError);
  });

  it("resolves --analysis and --export-dir from cwd", () => {
    const config = parseRuntimeConfig(
      ["--analysis", "./data/a.barnes.json", "--export-dir", "./out"],
      {},
      "/repo",
    );
    expect(config.analysisPath.replace(/\\/g, "/")).toMatch(/data\/a\.barnes\.json$/);
    expect(config.exportDir.replace(/\\/g, "/")).toMatch(/out$/);
  });

  it("accepts environment fallbacks", () => {
    const config = parseRuntimeConfig([], {
      BARNES_ANALYSIS_PATH: "exports/one.barnes.json",
      BARNES_EXPORT_DIR: "mcp-exports",
    }, "/repo");
    expect(config.analysisPath.replace(/\\/g, "/")).toContain("exports/one.barnes.json");
  });
});

describe("sanitizeExportFileName", () => {
  it("rejects traversal and absolute paths", () => {
    expect(() => sanitizeExportFileName("..\\secret.csv")).toThrow(/path separators|\.\./);
    expect(() => sanitizeExportFileName("D:/abs.csv")).toThrow(/Absolute/);
  });
});
