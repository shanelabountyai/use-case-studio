import { config } from "dotenv";

// Vitest (unlike Next.js) doesn't load .env automatically — needed here so
// `npm run test:integration` picks up DATABASE_URL when run locally. In CI
// the workflow sets DATABASE_URL directly as an env var, so this is a no-op.
config();
