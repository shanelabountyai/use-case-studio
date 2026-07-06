import { describe, it, expect, vi } from "vitest";

vi.mock("@/db", () => ({ db: { insert: vi.fn() } }));

import { db } from "@/db";
import { EXAMPLES } from "./examples";
import { evaluate } from "./engine";
import { seedExamplesForUser } from "./onboarding";

describe("seedExamplesForUser", () => {
  it("inserts one row per worked example, scoped to the given user, verdict computed server-side", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({ values } as unknown as ReturnType<typeof db.insert>);

    await seedExamplesForUser("user-123");

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledTimes(1);
    const rows = values.mock.calls[0][0] as { userId: string; name: string; verdict: string; composite: number }[];
    expect(rows).toHaveLength(EXAMPLES.length);
    rows.forEach((row, i) => {
      expect(row.userId).toBe("user-123");
      expect(row.name).toBe(EXAMPLES[i].name);
      expect(row.verdict).toBe(evaluate(EXAMPLES[i]).verdict);
      expect(row.composite).toBe(Math.round(evaluate(EXAMPLES[i]).composite));
    });
  });
});
