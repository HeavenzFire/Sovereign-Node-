import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DurableTaskLedger } from "../src/lib/durable-task-ledger";

async function fixture(options: { leaseMs?: number; maxAttempts?: number } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "heavenzfire-ledger-"));
  let now = 1_000;
  const ledger = new DurableTaskLedger(join(directory, "tasks.json"), {
    leaseMs: options.leaseMs ?? 100,
    maxAttempts: options.maxAttempts ?? 3,
    clock: () => now,
    lockWaitMs: 1_000
  });
  return {
    directory,
    ledger,
    setNow(value: number) { now = value; },
    cleanup: () => rm(directory, { recursive: true, force: true })
  };
}

function envelope(taskId: string, idempotencyKey = taskId) {
  return {
    task_id: taskId,
    capability: "health.read",
    idempotency_key: idempotencyKey,
    deadline: new Date(Date.now() + 60_000).toISOString()
  };
}

test("ledger persists tasks across instances and returns idempotent enqueue", async () => {
  const f = await fixture();
  try {
    const first = await f.ledger.enqueue(envelope("task-1"));
    const duplicate = await f.ledger.enqueue(envelope("task-1"));
    assert.equal(duplicate.task_id, first.task_id);
    assert.equal(duplicate.state, "QUEUED");
    const reopened = new DurableTaskLedger(join(f.directory, "tasks.json"), { clock: () => 1_000 });
    const persisted = await reopened.get("task-1");
    assert.equal(persisted?.state, "QUEUED");
    assert.equal(persisted?.idempotency_key, "task-1");
  } finally {
    await f.cleanup();
  }
});

test("idempotency keys cannot silently alias different task IDs", async () => {
  const f = await fixture();
  try {
    await f.ledger.enqueue(envelope("task-1", "shared-key"));
    await assert.rejects(
      f.ledger.enqueue(envelope("task-2", "shared-key")),
      /idempotency_key already belongs/
    );
  } finally {
    await f.cleanup();
  }
});

test("claim, start, and completion require the current owner and fencing token", async () => {
  const f = await fixture();
  try {
    await f.ledger.enqueue(envelope("task-1"));
    const lease = await f.ledger.claim("task-1", "worker-a");
    assert.equal(lease.state, "LEASED");
    assert.equal(lease.attempt, 1);
    assert.equal(lease.fencing_token, 1);
    await assert.rejects(f.ledger.start("task-1", "worker-b", lease.fencing_token), /stale/);
    await f.ledger.start("task-1", "worker-a", lease.fencing_token);
    const done = await f.ledger.complete("task-1", "worker-a", lease.fencing_token, { verified: true });
    assert.equal(done.state, "SUCCEEDED");
    assert.deepEqual(done.result, { verified: true });
    assert.equal(done.lease_owner, null);
    await assert.rejects(f.ledger.claim("task-1", "worker-b"), /not queued/);
  } finally {
    await f.cleanup();
  }
});

test("expired leases fence stale workers before task reassignment", async () => {
  const f = await fixture({ leaseMs: 50 });
  try {
    await f.ledger.enqueue(envelope("task-1"));
    const first = await f.ledger.claim("task-1", "worker-a");
    await f.ledger.start("task-1", "worker-a", first.fencing_token);
    f.setNow(1_051);
    assert.equal(await f.ledger.reapExpiredLeases(), 1);
    const recovered = await f.ledger.get("task-1");
    assert.equal(recovered?.state, "QUEUED");
    assert.equal(recovered?.fencing_token, 2);
    await assert.rejects(
      f.ledger.complete("task-1", "worker-a", first.fencing_token, { stale: true }),
      /stale/
    );
    const second = await f.ledger.claim("task-1", "worker-b");
    assert.equal(second.fencing_token, 3);
    assert.equal(second.attempt, 2);
  } finally {
    await f.cleanup();
  }
});

test("retryable failure requeues within the budget and dead-letters at exhaustion", async () => {
  const f = await fixture({ maxAttempts: 2 });
  try {
    await f.ledger.enqueue(envelope("task-1"));
    const first = await f.ledger.claim("task-1", "worker-a");
    await f.ledger.start("task-1", "worker-a", first.fencing_token);
    const queued = await f.ledger.fail("task-1", "worker-a", first.fencing_token, "temporary", true);
    assert.equal(queued.state, "QUEUED");
    const second = await f.ledger.claim("task-1", "worker-b");
    await f.ledger.start("task-1", "worker-b", second.fencing_token);
    const dead = await f.ledger.fail("task-1", "worker-b", second.fencing_token, "still failing", true);
    assert.equal(dead.state, "DEAD_LETTER");
    assert.equal(dead.attempt, 2);
  } finally {
    await f.cleanup();
  }
});

test("expired lease at retry exhaustion becomes dead-lettered", async () => {
  const f = await fixture({ leaseMs: 10, maxAttempts: 1 });
  try {
    await f.ledger.enqueue(envelope("task-1"));
    await f.ledger.claim("task-1", "worker-a");
    f.setNow(1_011);
    assert.equal(await f.ledger.reapExpiredLeases(), 1);
    const task = await f.ledger.get("task-1");
    assert.equal(task?.state, "DEAD_LETTER");
    assert.equal(task?.lease_owner, null);
  } finally {
    await f.cleanup();
  }
});

test("worker lease renewal extends expiry and oversized results are rejected", async () => {
  const f = await fixture({ leaseMs: 50 });
  try {
    await f.ledger.enqueue(envelope("task-1"));
    const lease = await f.ledger.claim("task-1", "worker-a");
    await f.ledger.start("task-1", "worker-a", lease.fencing_token);
    f.setNow(1_040);
    const renewed = await f.ledger.renew("task-1", "worker-a", lease.fencing_token);
    assert.equal(renewed.lease_until_ms, 1_090);
    await assert.rejects(
      f.ledger.complete("task-1", "worker-a", lease.fencing_token, "x".repeat(1_000_001)),
      /no larger than 1 MB/
    );
    f.setNow(1_080);
    assert.equal(await f.ledger.reapExpiredLeases(), 0);
  } finally {
    await f.cleanup();
  }
});

test("parallel enqueues are serialized and preserved", async () => {
  const f = await fixture();
  try {
    await Promise.all(
      Array.from({ length: 12 }, (_, i) => f.ledger.enqueue(envelope(`task-${i}`)))
    );
    assert.equal((await f.ledger.list()).length, 12);
  } finally {
    await f.cleanup();
  }
});
