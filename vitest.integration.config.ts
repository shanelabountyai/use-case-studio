import path from "node:path";
import { defineConfig } from "vitest/config";

// Separate from vitest.config.ts on purpose: these tests hit a REAL Postgres
// database (DATABASE_URL) — never bundled into the fast, mock-only `npm run
// test` default run. In CI this points at a disposable Neon branch; locally,
// point .env's DATABASE_URL at a throwaway branch before running this.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    include: ["integration/**/*.integration.test.ts"],
    setupFiles: ["./integration/setup-env.ts"],
    // Real network/DB round-trips are slower than mocked unit tests.
    testTimeout: 15000,
  },
});
