export type ToolErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

export function toolError(code: string, message: string): {
  isError: true;
  content: Array<{ type: "text"; text: string }>;
  structuredContent: ToolErrorBody;
} {
  return {
    isError: true,
    content: [{ type: "text", text: `${code}: ${message}` }],
    structuredContent: { error: { code, message } },
  };
}

export function toolOk<T extends Record<string, unknown>>(
  data: T,
  text: string,
): {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: T;
} {
  return {
    content: [{ type: "text", text }],
    structuredContent: data,
  };
}

export function isErrorBody(value: unknown): value is ToolErrorBody {
  return Boolean(value && typeof value === "object" && "error" in value);
}
