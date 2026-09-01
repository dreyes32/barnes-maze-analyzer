import { describe, expect, it } from "vitest";
import { methodNumberSchemas, parseWithNumberSchema } from "../../src/domain/parameterValues";
import { parseSessionFile } from "../../src/domain/schemas";
import { createEmptySession } from "../../src/domain/session";
import { DEFAULT_PARAMETERS, cloneParameters } from "../../src/domain/defaults";
import { sessionToPortableJson, parsePortableSession } from "../../src/export/analysisJson";

describe("method numeric validation", () => {
  it("does not accept a cleared positive-only field as zero", () => {
    expect(parseWithNumberSchema(methodNumberSchemas.investigationRadiusCm, "")).toEqual({
      ok: false,
      message: "Enter a number.",
    });
    const zero = parseWithNumberSchema(methodNumberSchemas.investigationRadiusCm, "0");
    expect(zero.ok).toBe(false);
    if (!zero.ok) expect(zero.message).toBe("Must be greater than 0.");
  });

  it("accepts a valid decimal", () => {
    expect(parseWithNumberSchema(methodNumberSchemas.minInvestigationSeconds, "0.4")).toEqual({
      ok: true,
      value: 0.4,
    });
  });

  it("keeps a saved session parseable after valid parameter edits", () => {
    const session = createEmptySession();
    session.parameters = cloneParameters(DEFAULT_PARAMETERS);
    session.parameters.events.minInvestigationSeconds = 0.4;
    const parsed = parsePortableSession(sessionToPortableJson(session));
    expect(parsed.parameters.events.minInvestigationSeconds).toBe(0.4);
    expect(() => parseSessionFile(parsed)).not.toThrow();
  });
});
