import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { intakeToPayload, type IntakeAnswers } from "./intake";
import { intakeNotificationEmail, sendIntakeNotification } from "./notify";

const ANSWERS: IntakeAnswers = {
  Company: "Acme Health",
  "Your name": "Dana Lee",
  email: "dana@acme.example",
  Problem: "Support agents hand-search a policy PDF library to answer member questions.",
};

const PAYLOAD = intakeToPayload(ANSWERS);

const ORIGINAL_KEY = process.env.AUTH_RESEND_KEY;

describe("intakeNotificationEmail", () => {
  it("puts the company in the subject and the submitter + problem in the body", () => {
    const { subject, text } = intakeNotificationEmail(PAYLOAD);
    expect(subject).toBe("New intake — Acme Health");
    expect(text).toContain('saved to your Library as "Intake — Acme Health"');
    expect(text).toContain("Dana Lee · dana@acme.example");
    expect(text).toContain("hand-search a policy PDF library");
    expect(text).toContain("FROM INTAKE");
  });

  it("degrades gracefully when optional fields are missing", () => {
    const bare = intakeToPayload({ Problem: "Something broke." });
    const { subject, text } = intakeNotificationEmail(bare);
    expect(subject).toBe("New intake — unknown company");
    expect(text).toContain("(no submitter details)");
  });

  it("truncates a very long problem statement", () => {
    const long = intakeToPayload({ ...ANSWERS, Problem: "x".repeat(1000) });
    const { text } = intakeNotificationEmail(long);
    expect(text).toContain("x".repeat(300) + "…");
    expect(text).not.toContain("x".repeat(301));
  });
});

describe("sendIntakeNotification", () => {
  beforeEach(() => {
    process.env.AUTH_RESEND_KEY = "re_test_key";
  });
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.AUTH_RESEND_KEY;
    else process.env.AUTH_RESEND_KEY = ORIGINAL_KEY;
  });

  it("POSTs to Resend with the key, sender, and recipient", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const ok = await sendIntakeNotification("owner@example.com", PAYLOAD, fetchMock as unknown as typeof fetch);
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test_key");
    const body = JSON.parse(init.body);
    expect(body.from).toBe("onboarding@resend.dev");
    expect(body.to).toBe("owner@example.com");
    expect(body.subject).toContain("Acme Health");
  });

  it("returns false without calling fetch when AUTH_RESEND_KEY is unset", async () => {
    delete process.env.AUTH_RESEND_KEY;
    const fetchMock = vi.fn();
    const ok = await sendIntakeNotification("owner@example.com", PAYLOAD, fetchMock as unknown as typeof fetch);
    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns false on a non-OK response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 422 });
    const ok = await sendIntakeNotification("owner@example.com", PAYLOAD, fetchMock as unknown as typeof fetch);
    expect(ok).toBe(false);
  });

  it("returns false (never throws) when fetch rejects", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    const ok = await sendIntakeNotification("owner@example.com", PAYLOAD, fetchMock as unknown as typeof fetch);
    expect(ok).toBe(false);
  });
});
