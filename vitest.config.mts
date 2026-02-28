import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    // vmThreads runs workers as Node.js worker threads with per-file VM-context
    // isolation. On Linux/CI, v8 coverage collection works correctly with worker
    // threads and the memory footprint stays well under the 7 GB GitHub Actions
    // limit. The default `forks` pool spawns one child process per test file;
    // with 24+ files each loading jsdom + v8 instrumentation, coverage
    // aggregation in the main process pushes past 4 GB and OOMs in CI.
    // Note: vmThreads does not write coverage files on macOS (local dev only);
    // coverage output is confirmed to work on Linux/CI (see CI run 22529136483).
    pool: "vmThreads",
    environment: "jsdom",
    globals: true,
    setupFiles: "./vitest.setup.ts",
    alias: {
      "@": resolve(__dirname, "./src"),
    },
    coverage: {
      provider: "v8",
      // The html reporter is memory-intensive and only useful for local browsing;
      // CI only needs lcov (SonarCloud), json-summary (thresholds), and text output.
      reporter: process.env.CI
        ? ["text", "json", "json-summary", "lcov"]
        : ["text", "json", "json-summary", "lcov", "html"],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
      exclude: [
        "node_modules/",
        ".next/",
        "vitest.config.mts",
        "vitest.setup.ts",
        "next.config.ts",
        "postcss.config.mjs",
        "commitlint.config.js",
        "stylelint.config.mjs",
        "src/app/layout.tsx",
        "src/types/dashboard.ts",
      ],
    },
  },
});
