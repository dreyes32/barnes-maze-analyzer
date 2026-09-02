import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL("..", import.meta.url)),
  test: {
    name: "mcp",
    globals: true,
    environment: "node",
    include: ["mcp/tests/**/*.test.ts"],
    pool: "forks",
    fileParallelism: false,
  },
});
