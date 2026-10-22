import assert from "node:assert/strict";
import test from "node:test";
import { UnifiedFieldRegistry } from "../src/lib/unified-field-registry";

test("registration uses server clock and heartbeat restores a stale node", () => {
  let now = 1000;
  const registry = new UnifiedFieldRegistry(100, () => now);
  const registered = registry.register({ id: "worker-a", capabilities: ["health.read"], maxTasks: 2 });
  assert.equal(registered.lastHeartbeatMs, 1000);
  now = 1101;
  assert.equal(registry.list()[0].status, "offline");
  now = 1200;
  registry.heartbeat("worker-a");
  assert.equal(registry.list()[0].status, "healthy");
  assert.equal(registry.list()[0].lastHeartbeatMs, 1200);
});

test("unknown heartbeat is not accepted", () => {
  const registry = new UnifiedFieldRegistry(100, () => 1000);
  assert.equal(registry.heartbeat("missing"), null);
});

test("rejects malformed ids, duplicate capabilities, and unsafe capacities", () => {
  const registry = new UnifiedFieldRegistry(100, () => 1000);
  assert.throws(() => registry.register({ id: "../bad", capabilities: ["health.read"], maxTasks: 1 }));
  assert.throws(() => registry.register({ id: "worker-a", capabilities: ["health.read", "health.read"], maxTasks: 1 }));
  assert.throws(() => registry.register({ id: "worker-b", capabilities: ["health.read"], maxTasks: 0 }));
  assert.throws(() => registry.register({ id: "worker-c", capabilities: ["Task RUN"], maxTasks: 1 }));
});

test("re-registration refreshes heartbeat without resetting registration time", () => {
  let now = 1000;
  const registry = new UnifiedFieldRegistry(100, () => now);
  registry.register({ id: "worker-a", capabilities: ["health.read"], maxTasks: 2 });
  now = 1050;
  registry.register({ id: "worker-a", capabilities: ["health.read", "capabilities.read"], maxTasks: 3 });
  const node = registry.list()[0];
  assert.equal(node.registeredAtMs, 1000);
  assert.equal(node.lastHeartbeatMs, 1050);
  assert.deepEqual(node.capabilities, ["health.read", "capabilities.read"]);
  assert.equal(node.maxTasks, 3);
});

test("rejects a backwards-moving heartbeat clock", () => {
  let now = 1000;
  const registry = new UnifiedFieldRegistry(100, () => now);
  registry.register({ id: "worker-a", capabilities: ["health.read"], maxTasks: 1 });
  now = 999;
  assert.throws(() => registry.heartbeat("worker-a"), /Clock moved backwards/);
});

test("remove is explicit and deterministic", () => {
  const registry = new UnifiedFieldRegistry(100, () => 1000);
  registry.register({ id: "worker-a", capabilities: ["health.read"], maxTasks: 1 });
  assert.equal(registry.remove("worker-a"), true);
  assert.equal(registry.remove("worker-a"), false);
  assert.deepEqual(registry.list(), []);
});
