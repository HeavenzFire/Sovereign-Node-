import { timingSafeEqual } from "node:crypto";

/**
 * Verifies a per-request approval credential.
 * Fails closed when no server-side token is configured or input is malformed.
 * This is a local bearer-token gate, not a substitute for a trusted human approval UI.
 */
export function hasValidApprovalToken(
  provided: unknown,
  configured: string | undefined
): boolean {
  if (typeof configured !== "string" || configured.length < 32) return false;
  if (typeof provided !== "string" || provided.length === 0) return false;

  const expected = Buffer.from(configured, "utf8");
  const actual = Buffer.from(provided, "utf8");
  if (expected.length !== actual.length) return false;

  return timingSafeEqual(expected, actual);
}
