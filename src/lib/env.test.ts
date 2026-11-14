import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { envSchema, parseEnv } from "./env";

const root = path.resolve(__dirname, "../..");
const TEST_ONLY = ["BK_LIVE", "BK_RUNS", "BK_CONC", "BK_ARTIFACT_DIR", "E2E_BASE_URL"];
// Set by the platform/runtime, never by an operator.
const PLATFORM = ["NODE_ENV", "NEXT_RUNTIME", "CI"];

function exampleKeys(): string[] {
  return readFileSync(path.join(root, ".env.example"), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z0-9_]+)=/)?.[1])
    .filter((k): k is string => !!k);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx|mts)$/.test(name) ? [p] : [];
  });
}

describe("parseEnv", () => {
  it("accepts a minimal dev env and treats empty values as unset", () => {
    const e = parseEnv({ DATABASE_URL: "postgres://x", INTAKE_KEY: "", NODE_ENV: "development" });
    expect(e.DATABASE_URL).toBe("postgres://x");
    expect(e.INTAKE_KEY).toBeUndefined();
  });

  it("names a missing or malformed key without echoing values", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ DATABASE_URL: "x", INTAKE_OWNER_EMAIL: "not-an-email-secret" }))
      .toThrow(/^Invalid environment: INTAKE_OWNER_EMAIL$/);
    expect(() => parseEnv({ DATABASE_URL: "x", KICKOFF_DAILY_CEILING: "lots" })).toThrow(/KICKOFF_DAILY_CEILING/);
  });

  it("requires AUTH_SECRET in production", () => {
    expect(() => parseEnv({ DATABASE_URL: "x", NODE_ENV: "production" })).toThrow(/AUTH_SECRET/);
    expect(() => parseEnv({ DATABASE_URL: "x", NODE_ENV: "production", AUTH_SECRET: "s" })).not.toThrow();
  });
});

describe("missing provider in production (K10)", () => {
  it("refuses to boot a Vercel production deploy without AUTH_RESEND_KEY", () => {
    const base = { DATABASE_URL: "x", NODE_ENV: "production", AUTH_SECRET: "s" };
    expect(() => parseEnv({ ...base, VERCEL_ENV: "production" })).toThrow(/AUTH_RESEND_KEY/);
    expect(() => parseEnv({ ...base, VERCEL_ENV: "production", AUTH_RESEND_KEY: "re_x" })).not.toThrow();
    expect(() => parseEnv({ ...base, VERCEL_ENV: "preview" })).not.toThrow();
  });
});

describe(".env.example (K11)", () => {
  it("lists every schema key, and nothing else besides test-harness keys", () => {
    const schemaKeys = Object.keys(envSchema.shape).filter((k) => !PLATFORM.includes(k));
    expect(exampleKeys().sort()).toEqual([...schemaKeys, ...TEST_ONLY].sort());
  });

  it("every process.env key read in code is in the schema or the test-harness list", () => {
    const files = [
      ...sourceFiles(path.join(root, "src")),
      ...sourceFiles(path.join(root, "e2e")),
      ...sourceFiles(path.join(root, "integration")),
      path.join(root, "playwright.config.ts"),
      path.join(root, "drizzle.config.ts"),
    ];
    const read = new Set<string>();
    for (const f of files) {
      for (const m of readFileSync(f, "utf8").matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) read.add(m[1]);
    }
    const known = new Set([...Object.keys(envSchema.shape), ...TEST_ONLY, ...PLATFORM]);
    expect([...read].filter((k) => !known.has(k))).toEqual([]);
  });

  it("no NEXT_PUBLIC_ variables exist (none may hold a secret)", () => {
    expect(exampleKeys().filter((k) => k.startsWith("NEXT_PUBLIC_"))).toEqual([]);
  });
});
