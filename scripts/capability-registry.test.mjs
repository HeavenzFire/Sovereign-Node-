import test from "node:test";
import assert from "node:assert/strict";
import { validateCapabilityRegistry } from "./capability-registry.mjs";

const validRegistry = () => ({
  schema_version: "1.0",
  capabilities: [{
    id: "sovereign-node.health",
    name: "Sovereign Node health",
    version: "1.0.0",
    health_check: { kind: "http", path: "/api/health", method: "GET" }
  }]
});

test("accepts a well-formed registry", () => {
  assert.deepEqual(validateCapabilityRegistry(validRegistry()), { valid: true, errors: [] });
});

test("rejects a non-object registry", () => {
  assert.deepEqual(validateCapabilityRegistry(null), {
    valid: false, errors: ["registry must be an object"]
  });
});

test("rejects unsupported schema versions", () => {
  const registry = validRegistry();
  registry.schema_version = "2.0";
  assert.equal(validateCapabilityRegistry(registry).valid, false);
});

test("rejects duplicate capability IDs", () => {
  const registry = validRegistry();
  registry.capabilities.push({ ...registry.capabilities[0] });
  assert.ok(validateCapabilityRegistry(registry).errors.some(error => error.includes("duplicates")));
});

test("rejects malformed IDs and missing required fields", () => {
  const registry = validRegistry();
  registry.capabilities[0].id = "Bad ID";
  registry.capabilities[0].name = " ";
  const result = validateCapabilityRegistry(registry);
  assert.ok(result.errors.some(error => error.includes("lowercase")));
  assert.ok(result.errors.some(error => error.includes(".name")));
});

test("rejects unsafe or malformed HTTP health paths", () => {
  const registry = validRegistry();
  registry.capabilities[0].health_check.path = "//example.com/health";
  assert.ok(validateCapabilityRegistry(registry).errors.some(error => error.includes("local absolute path")));
});

test("accepts manual health metadata only with a description", () => {
  const registry = validRegistry();
  registry.capabilities[0].health_check = { kind: "manual", description: "Check operator dashboard" };
  assert.equal(validateCapabilityRegistry(registry).valid, true);
  registry.capabilities[0].health_check.description = "";
  assert.equal(validateCapabilityRegistry(registry).valid, false);
});

test("rejects a non-array capabilities field", () => {
  const registry = validRegistry();
  registry.capabilities = {};
  assert.ok(validateCapabilityRegistry(registry).errors.includes("capabilities must be an array"));
});

test("rejects backslashes and control characters in HTTP health paths", () => {
  for (const unsafePath of ["/\\\\attacker.example/health", "/api/health\\\\..\\\\admin", "/api/health\\u0000"]) {
    const registry = validRegistry();
    registry.capabilities[0].health_check.path = unsafePath;
    assert.equal(validateCapabilityRegistry(registry).valid, false, unsafePath);
  }
});
