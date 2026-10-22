import assert from "node:assert/strict";
import test from "node:test";
import { selectWorker, shouldRetryTask, type WorkerCandidate } from "../src/lib/worker-router";

const workers: WorkerCandidate[] = [
  { id: "worker-b", health: "online", capabilities: ["health.read", "seal.create"], activeTasks: 2 },
  { id: "worker-a", health: "online", capabilities: ["health.read"], activeTasks: 1 },
  { id: "worker-offline", health: "offline", capabilities: ["health.read"], activeTasks: 0 },
  { id: "worker-degraded", health: "degraded", capabilities: ["health.read"], activeTasks: 0 }
];

test("routes to the least-loaded healthy worker with the requested capability", () => {
  assert.deepEqual(selectWorker("health.read", workers), {
    selected: true,
    workerId: "worker-a",
    reason: "least-loaded-capable-online-worker"
  });
});

test("does not route work to offline or degraded workers", () => {
  assert.deepEqual(selectWorker("missing.capability", workers), {
    selected: false,
    reason: "no-eligible-worker"
  });
  assert.deepEqual(selectWorker("health.read", workers.slice(2)), {
    selected: false,
    reason: "no-eligible-worker"
  });
});

test("breaks equal-load ties deterministically by worker ID", () => {
  const tied: WorkerCandidate[] = [
    { id: "zeta", health: "online", capabilities: ["health.read"], activeTasks: 0 },
    { id: "alpha", health: "online", capabilities: ["health.read"], activeTasks: 0 }
  ];
  const result = selectWorker("health.read", tied);
  assert.equal(result.selected, true);
  if (result.selected) assert.equal(result.workerId, "alpha");
});

test("rejects invalid worker load values", () => {
  const invalid: WorkerCandidate[] = [
    { id: "bad-negative", health: "online", capabilities: ["health.read"], activeTasks: -1 },
    { id: "bad-fraction", health: "online", capabilities: ["health.read"], activeTasks: 0.5 }
  ];
  assert.equal(selectWorker("health.read", invalid).selected, false);
});

test("retries only bounded, idempotent worker failures", () => {
  assert.equal(shouldRetryTask({
    workerFailure: true, idempotent: true, attempt: 1, maxAttempts: 3,
    approvalRequired: false, approvalGranted: false
  }), true);
  assert.equal(shouldRetryTask({
    workerFailure: true, idempotent: false, attempt: 1, maxAttempts: 3,
    approvalRequired: false, approvalGranted: false
  }), false);
  assert.equal(shouldRetryTask({
    workerFailure: true, idempotent: true, attempt: 3, maxAttempts: 3,
    approvalRequired: false, approvalGranted: false
  }), false);
  assert.equal(shouldRetryTask({
    workerFailure: true, idempotent: true, attempt: 1, maxAttempts: 3,
    approvalRequired: true, approvalGranted: false
  }), false);
  assert.equal(shouldRetryTask({
    workerFailure: false, idempotent: true, attempt: 1, maxAttempts: 3,
    approvalRequired: false, approvalGranted: false
  }), false);
});

test("excludes workers with missing or blank IDs", () => {
  const invalid: WorkerCandidate[] = [
    { id: "", health: "online", capabilities: ["health.read"], activeTasks: 0 },
    { id: "   ", health: "online", capabilities: ["health.read"], activeTasks: 0 }
  ];
  assert.equal(selectWorker("health.read", invalid).selected, false);
});
