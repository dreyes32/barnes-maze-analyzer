import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Relative base so Vercel, a subdirectory host, or a local file:// preview
// can serve the app without a required backend or root-path assumption.
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "1.0.0"),
    __GIT_SHA__: JSON.stringify(process.env.VITE_GIT_SHA ?? "unknown"),
  },
  worker: {
    format: "es",
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
