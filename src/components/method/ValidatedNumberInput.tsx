import { useId, useState, type InputHTMLAttributes } from "react";
import type { z } from "zod";
import { parseWithNumberSchema } from "../../domain/parameterValues";

export function ValidatedNumberInput({
  value,
  schema,
  onCommit,
  ...inputProps
}: {
  value: number | "auto";
  schema: z.ZodType<number | "auto"> | z.ZodType<number>;
  onCommit: (value: number | "auto") => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onBlur">) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  const display = draft ?? String(value);

  const commit = () => {
    const raw = draft ?? String(value);
    const parsed = parseWithNumberSchema(schema, raw);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setError(null);
    setDraft(null);
    if (parsed.value !== value) onCommit(parsed.value);
  };

  return (
    <span>
      <input
        {...inputProps}
        value={display}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            (event.target as HTMLInputElement).blur();
          }
        }}
      />
      {error ? (
        <span className="help" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
