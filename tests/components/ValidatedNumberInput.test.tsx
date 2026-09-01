import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ValidatedNumberInput } from "../../src/components/method/ValidatedNumberInput";
import { methodNumberSchemas } from "../../src/domain/parameterValues";
import { DEFAULT_PARAMETERS, cloneParameters } from "../../src/domain/defaults";
import { parseSessionFile } from "../../src/domain/schemas";
import { createEmptySession } from "../../src/domain/session";

function Harness() {
  const [value, setValue] = useState(DEFAULT_PARAMETERS.events.investigationRadiusCm);
  const [session] = useState(() => {
    const next = createEmptySession();
    next.parameters = cloneParameters(DEFAULT_PARAMETERS);
    return next;
  });
  session.parameters.events.investigationRadiusCm = value;
  return (
    <label>
      Investigation radius (cm)
      <ValidatedNumberInput
        value={value}
        schema={methodNumberSchemas.investigationRadiusCm}
        onCommit={(next) => setValue(next as number)}
      />
      <span data-testid="committed">{value}</span>
    </label>
  );
}

describe("ValidatedNumberInput", () => {
  it("does not persist a cleared or zero value", () => {
    render(<Harness />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a number.");
    expect(screen.getByTestId("committed")).toHaveTextContent("3.5");

    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);
    expect(screen.getByRole("alert")).toHaveTextContent("Must be greater than 0.");
    expect(screen.getByTestId("committed")).toHaveTextContent("3.5");

    const session = createEmptySession();
    session.parameters = cloneParameters(DEFAULT_PARAMETERS);
    expect(() => parseSessionFile(JSON.parse(JSON.stringify(session)))).not.toThrow();
  });
});
