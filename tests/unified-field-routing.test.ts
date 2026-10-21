import assert from "node:assert/strict";
import test from "node:test";
import { planFailover, selectWorker, type WorkerNode } from "../src/lib/unified-field-routing";

const now = 1_800_000_000_000;
const nodes: WorkerNode[] = [
  { id: "worker-a", status: "healthy", capabilities: ["task.run"], activeTasks: 2, maxTasks: 4, lastHeartbeatMs: now },
  { id: "worker-b", status: "healthy", capabilities: ["task.run"], activeTasks: 0, maxTasks: 4, lastHeartbeatMs: now },
  { id: "worker-c", status: "offline", capabilities: ["task.run"], activeTasks: 0, maxTasks: 4, lastHeartbeatMs: now },
  { id: "worker-d", status: "healthy", capabilities: ["other"], activeTasks: 0, maxTasks: 4, lastHeartbeatMs: now },
  { id: "worker-e", status: "healthy", capabilities: ["task.run"], activeTasks: 0, maxTasks: 4, lastHeartbeatMs: now - 30_000 }
];

test("routes to the least-loaded healthy, fresh, compatible worker", () => {
  assert.deepEqual(selectWorker(nodes, ["task.run"], [], now), {
    ok: true, nodeId: "worker-b", reason: "least-loaded-healthy-compatible"
  });
});

test("failed worker is excluded and work can fail over to another node", () => {
  const decision = planFailover(nodes, ["task.run"], ["worker-b"], 3, now);
  assert.equal(decision.ok, true);
  if (decision.ok) assert.equal(decision.nodeId, "worker-a");
});

test("offline, stale, saturated, and capability-mismatched nodes are not selected", () => {
  const decision = selectWorker([
    ...nodes,
    { id: "worker-full", status: "healthy", capabilities: ["task.run"], activeTasks: 4, maxTasks: 4, lastHeartbeatMs: now }
  ], ["task.run"], ["worker-a", "worker-b"], now);
  assert.deepEqual(decision, {
    ok: false, reason: "no-eligible-node", excluded: ["worker-a", "worker-b"]
  });
});

test("failover is bounded and rejects invalid attempt budgets", () => {
  assert.equal(planFailover(nodes, ["task.run"], ["worker-b", "worker-a"], 2, now).ok, false);
  assert.equal(planFailover(nodes, ["task.run"], [], 0, now).ok, false);
});

test("tie-breaking is deterministic", () => {
  const tied = [
    { id: "z-worker", status: "healthy" as const, capabilities: ["task.run"], activeTasks: 0, maxTasks: 2, lastHeartbeatMs: now },
    { id: "a-worker", status: "healthy" as const, capabilities: ["task.run"], activeTasks: 0, maxTasks: 2, lastHeartbeatMs: now }
  ];
  const decision = selectWorker(tied, ["task.run"], [], now);
  assert.equal(decision.ok && decision.nodeId, "a-worker");
});
