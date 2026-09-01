import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Playwright e2e specs live in /e2e and use their own runner.
    exclude: ["**/node_modules/**", "**/e2e/**", "**/.next/**"],
    // Four test files each boot a full Postgres (pglite, WASM) in `beforeAll`
    // and replay every migration into it. Vitest runs files in parallel, so on
    // a loaded machine that setup can exceed the 10s default and the file gets
    // reported as skipped rather than failed — which reads like nothing ran.
    // The work is legitimately slow; give it room instead of chasing a flake.
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
});
