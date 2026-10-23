import assert from "node:assert/strict";
import test from "node:test";
import { hasValidApprovalToken } from "../src/lib/approval-gate";

const token = "hf-test-approval-token-with-at-least-32-chars";

test("accepts an exact configured approval token", () => {
  assert.equal(hasValidApprovalToken(token, token), true);
});

test("fails closed when token is missing or not configured", () => {
  assert.equal(hasValidApprovalToken(undefined, token), false);
  assert.equal(hasValidApprovalToken("", token), false);
  assert.equal(hasValidApprovalToken(token, undefined), false);
  assert.equal(hasValidApprovalToken(token, "short"), false);
});

test("rejects wrong and different-length tokens", () => {
  assert.equal(hasValidApprovalToken("wrong-token", token), false);
  assert.equal(hasValidApprovalToken(token + "x", token), false);
});

test("rejects non-string token inputs", () => {
  assert.equal(hasValidApprovalToken({ token }, token), false);
  assert.equal(hasValidApprovalToken(123, token), false);
});
