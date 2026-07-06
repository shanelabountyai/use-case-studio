import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // Real-DB integration tests and Playwright e2e specs have their own
    // runners (test:integration, test:e2e) — keep this default run fast
    // and mock-only so `npm run test` never touches a real database.
    exclude: [
      "**/node_modules/**", "**/dist/**", "**/.{idea,git,cache,output,temp}/**",
      "integration/**", "e2e/**",
    ],
  },
});
