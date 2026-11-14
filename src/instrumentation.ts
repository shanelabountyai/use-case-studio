/* Runs once when a Next.js server instance boots (not during `next build`).
   Validates the environment so a missing or malformed variable stops the
   server at start-up with the key's name, instead of failing on first use
   (scorecard K11). */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { parseEnv } = await import("@/lib/env");
    parseEnv(process.env);
  }
}
