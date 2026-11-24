import { describe, it, expect } from "vitest";
import { assertLocalOrAllowed } from "./local-guard";

const NEON = "postgresql://u:p@ep-x-123.us-east-2.aws.neon.tech/db?sslmode=require";

describe("assertLocalOrAllowed (K12)", () => {
  it("allows local Postgres", () => {
    expect(() => assertLocalOrAllowed("postgres://postgres:postgres@localhost:5432/x", {})).not.toThrow();
  });
  it("refuses a cloud URL by default", () => {
    expect(() => assertLocalOrAllowed(NEON, {})).toThrow(/ALLOW_CLOUD_DB/);
    expect(() => assertLocalOrAllowed("postgres://a:b@x.supabase.co/db", {})).toThrow();
    expect(() => assertLocalOrAllowed("postgres://a:b@x.rds.amazonaws.com/db", {})).toThrow();
  });
  it("allows a cloud URL only when deliberate or deployed", () => {
    expect(() => assertLocalOrAllowed(NEON, { ALLOW_CLOUD_DB: "1" })).not.toThrow();
    expect(() => assertLocalOrAllowed(NEON, { ALLOW_CLOUD_DB: "true" })).toThrow();
    expect(() => assertLocalOrAllowed(NEON, { VERCEL_ENV: "preview" })).not.toThrow();
  });
  it("never echoes the URL", () => {
    expect(() => assertLocalOrAllowed(NEON, {})).toThrow(expect.objectContaining({ message: expect.not.stringContaining("neon.tech") }));
  });
});
