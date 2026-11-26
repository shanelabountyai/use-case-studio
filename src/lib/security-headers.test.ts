import { describe, it, expect } from "vitest";
// @ts-expect-error -- plain .mjs config, no type declarations
import config from "../../next.config.mjs";

type Header = { key: string; value: string };
type Rule = { source: string; headers: Header[] };

/* Scorecard K7: the security headers must apply to every route, and the
   share-link rule must still override Referrer-Policy with no-referrer. */
describe("next.config headers()", () => {
  it("sets the global security headers on /:path*", async () => {
    const rules: Rule[] = await config.headers();
    const global = rules.find((r) => r.source === "/:path*");
    expect(global).toBeDefined();
    const keys = Object.fromEntries(global!.headers.map((h) => [h.key, h.value]));
    expect(keys["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(keys["X-Content-Type-Options"]).toBe("nosniff");
    expect(keys["X-Frame-Options"]).toBe("DENY");
    expect(keys["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(keys["Strict-Transport-Security"]).toMatch(/max-age=\d+/);
  });

  it("keeps /s/* no-referrer/noindex/no-store, listed after the global rule", async () => {
    const rules: Rule[] = await config.headers();
    const gi = rules.findIndex((r) => r.source === "/:path*");
    const si = rules.findIndex((r) => r.source === "/s/:token*");
    expect(si).toBeGreaterThan(gi);
    const keys = Object.fromEntries(rules[si].headers.map((h) => [h.key, h.value]));
    expect(keys["Referrer-Policy"]).toBe("no-referrer");
    expect(keys["X-Robots-Tag"]).toContain("noindex");
    expect(keys["Cache-Control"]).toContain("no-store");
  });

  it("does not advertise the framework", () => {
    expect(config.poweredByHeader).toBe(false);
  });
});
