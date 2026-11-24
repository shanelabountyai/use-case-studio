import { config } from "dotenv";
import { assertLocalOrAllowed } from "../src/db/local-guard";

// Vitest (unlike Next.js) doesn't load .env automatically — needed here so
// `npm run test:integration` picks up DATABASE_URL when run locally. In CI
// the workflow sets DATABASE_URL directly as an env var, so this is a no-op.
config();

// These tests write real rows: refuse a cloud database unless ALLOW_CLOUD_DB=1
// (CI sets it for its disposable Neon branch). Scorecard K12.
assertLocalOrAllowed(process.env.DATABASE_URL);
