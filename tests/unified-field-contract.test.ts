import assert from "node:assert/strict";
import test from "node:test";
import {
  UNIFIED_FIELD_CAPABILITIES,
  isKnownCapability,
  isValidTaskEnvelope,
  requiresApproval
} from "../src/lib/unified-field-contract";
import { transitionTask } from "../src/lib/task-state-machine";

test("capability names are unique and versioned", () => {
  const names = UNIFIED_FIELD_CAPABILITIES.map((item) => item.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(UNIFIED_FIELD_CAPABILITIES.every((item) => item.version === "1.0.0"));
});

test("unknown capabilities are rejected", () => {
  assert.equal(isKnownCapability("system.shell"), false);
  assert.throws(() => requiresApproval("system.shell"), /Unknown capability/);
});

test("capabilities with effects require approval", () => {
  assert.equal(requiresApproval("health.read"), false);
  assert.equal(requiresApproval("seal.create"), true);
  assert.equal(requiresApproval("trinary.decide"), true);
  assert.equal(requiresApproval("engine.stream"), true);
});

test("valid task envelope is accepted", () => {
  assert.equal(isValidTaskEnvelope({
    task_id: "task-001",
    capability: "health.read",
    idempotency_key: "idem-001",
    deadline: "2030-01-01T00:00:00.000Z"
  }), true);
});

test("malformed task envelopes are rejected", () => {
  assert.equal(isValidTaskEnvelope(null), false);
  assert.equal(isValidTaskEnvelope([]), false);
  assert.equal(isValidTaskEnvelope({ task_id: "", capability: "health.read", idempotency_key: "k", deadline: "2030-01-01" }), false);
  assert.equal(isValidTaskEnvelope({ task_id: "t", capability: "unknown", idempotency_key: "k", deadline: "2030-01-01" }), false);
  assert.equal(isValidTaskEnvelope({ task_id: "t", capability: "health.read", idempotency_key: "", deadline: "2030-01-01" }), false);
  assert.equal(isValidTaskEnvelope({ task_id: "t", capability: "health.read", idempotency_key: "k", deadline: "not-a-date" }), false);
  assert.equal(isValidTaskEnvelope({ task_id: "t", capability: "health.read", idempotency_key: "k", deadline: "2000-01-01T00:00:00.000Z" }), false);
});

test("task lifecycle advances through lease, run, and success", () => {
  assert.equal(transitionTask("QUEUED", "LEASE_ACQUIRED", 0, 3), "LEASED");
  assert.equal(transitionTask("LEASED", "STARTED", 0, 3), "RUNNING");
  assert.equal(transitionTask("RUNNING", "SUCCEEDED", 1, 3), "SUCCEEDED");
});

test("retryable failures requeue only within the retry budget", () => {
  assert.equal(transitionTask("RUNNING", "RETRYABLE_FAILURE", 1, 3), "QUEUED");
  assert.equal(transitionTask("RUNNING", "RETRYABLE_FAILURE", 3, 3), "DEAD_LETTER");
  assert.equal(transitionTask("RUNNING", "PERMANENT_FAILURE", 1, 3), "FAILED");
});

test("terminal task states cannot transition again", () => {
  assert.throws(() => transitionTask("SUCCEEDED", "STARTED", 0, 3), /Illegal task transition/);
  assert.throws(() => transitionTask("FAILED", "LEASE_ACQUIRED", 0, 3), /Illegal task transition/);
});

test("invalid retry budgets are rejected", () => {
  assert.throws(() => transitionTask("RUNNING", "RETRYABLE_FAILURE", -1, 3), /attempt/);
  assert.throws(() => transitionTask("RUNNING", "RETRYABLE_FAILURE", 1, 0), /maxAttempts/);
});
