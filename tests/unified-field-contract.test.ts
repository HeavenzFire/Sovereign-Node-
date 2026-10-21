import assert from "node:assert/strict";
import test from "node:test";
import {
  UNIFIED_FIELD_CAPABILITIES,
  isKnownCapability,
  isValidTaskEnvelope,
  requiresApproval
} from "../src/lib/unified-field-contract";

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
});
