import { randomBytes } from "node:crypto";

/* Share-link tokens (FABLE-BRIEF M3): unguessable, URL-safe, revocable.
   24 random bytes = 192 bits of entropy, base64url-encoded to 32 chars
   (no padding, only [A-Za-z0-9_-]) — comfortably past the 24-char floor. */
export function generateShareToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Build the public share URL for a token, given the request origin. */
export function shareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/s/${token}`;
}
