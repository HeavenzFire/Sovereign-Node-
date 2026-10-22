import assert from "node:assert/strict";
import test from "node:test";
import { withRateLimitRetry } from "../src/lib/rate-limit-retry";

test("caps numeric Retry-After delays at maxDelayMs", async () => {
  const waits: number[] = [];
  const result = await withRateLimitRetry(async (attempt) => {
    if (attempt === 1) throw Object.assign(new Error("rate limited"), { status: 429, retryAfter: 120 });
    return "ok";
  }, { maxAttempts: 2, maxDelayMs: 25, sleep: async ms => { waits.push(ms); }, random: () => 0 });
  assert.equal(result, "ok");
  assert.deepEqual(waits, [25]);
});

test("caps date-form Retry-After delays at maxDelayMs", async () => {
  const waits: number[] = [];
  const now = Date.parse("2026-01-01T00:00:00.000Z");
  await withRateLimitRetry(async (attempt) => {
    if (attempt === 1) throw Object.assign(new Error("busy"), {
      status: 503, retryAfter: "Thu, 01 Jan 2026 00:01:00 GMT"
    });
    return "ok";
  }, { maxAttempts: 2, maxDelayMs: 40, now: () => now, sleep: async ms => { waits.push(ms); }, random: () => 0 });
  assert.deepEqual(waits, [40]);
});

test("does not retry non-retryable errors", async () => {
  let attempts = 0;
  await assert.rejects(withRateLimitRetry(async () => {
    attempts += 1;
    throw Object.assign(new Error("bad request"), { status: 400 });
  }, { sleep: async () => {} }), /bad request/);
  assert.equal(attempts, 1);
});
