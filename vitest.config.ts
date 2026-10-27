import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Playwright e2e specs live in /e2e and use their own runner. Claude Code
    // session worktrees (.claude/worktrees) are other checkouts of this repo.
    exclude: ["**/node_modules/**", "**/e2e/**", "**/.next/**", ".claude/**"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
});
