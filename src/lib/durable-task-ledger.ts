import { mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { isValidTaskEnvelope } from "./unified-field-contract";
import { transitionTask, type TaskState } from "./task-state-machine";

export type TaskEnvelope = {
  task_id: string;
  capability: string;
  idempotency_key: string;
  deadline: string;
};

export type LedgerEvent = {
  type: string;
  at_ms: number;
  worker_id?: string;
  fencing_token?: number;
  detail?: string;
};

export type LedgerTask = TaskEnvelope & {
  state: TaskState;
  attempt: number;
  max_attempts: number;
  fencing_token: number;
  lease_owner: string | null;
  lease_until_ms: number | null;
  created_at_ms: number;
  updated_at_ms: number;
  result?: unknown;
  error?: string;
  events: LedgerEvent[];
};

type LedgerDocument = {
  schema_version: 1;
  tasks: Record<string, LedgerTask>;
};

export type LedgerOptions = {
  leaseMs?: number;
  maxAttempts?: number;
  clock?: () => number;
  lockWaitMs?: number;
  lockStaleMs?: number;
};

const MAX_RESULT_BYTES = 1_000_000;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Small local-first durable task ledger. Updates are serialized with an
 * exclusive lock file and committed by atomic rename. This is suitable for a
 * single-host coordinator; it is not a distributed database or multi-host
 * consensus protocol.
 */
export class DurableTaskLedger {
  private readonly leaseMs: number;
  private readonly defaultMaxAttempts: number;
  private readonly clock: () => number;
  private readonly lockWaitMs: number;
  private readonly lockStaleMs: number;
  private readonly lockPath: string;

  constructor(private readonly filePath: string, options: LedgerOptions = {}) {
    this.leaseMs = options.leaseMs ?? 15_000;
    this.defaultMaxAttempts = options.maxAttempts ?? 3;
    this.clock = options.clock ?? Date.now;
    this.lockWaitMs = options.lockWaitMs ?? 5_000;
    this.lockStaleMs = options.lockStaleMs ?? 30_000;
    this.lockPath = `${filePath}.lock`;

    if (!filePath.trim()) throw new Error("filePath is required");
    if (!Number.isSafeInteger(this.leaseMs) || this.leaseMs < 1) {
      throw new RangeError("leaseMs must be a positive integer");
    }
    if (!Number.isSafeInteger(this.defaultMaxAttempts) || this.defaultMaxAttempts < 1) {
      throw new RangeError("maxAttempts must be a positive integer");
    }
  }

  async enqueue(envelope: TaskEnvelope, maxAttempts = this.defaultMaxAttempts): Promise<LedgerTask> {
    if (!isValidTaskEnvelope(envelope)) throw new Error("Invalid or expired task envelope");
    if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100) {
      throw new RangeError("maxAttempts must be an integer between 1 and 100");
    }

    return this.withLock((document) => {
      const sameId = document.tasks[envelope.task_id];
      if (sameId) {
        if (sameId.idempotency_key === envelope.idempotency_key &&
            sameId.capability === envelope.capability) return clone(sameId);
        throw new Error("task_id already exists with different task identity");
      }

      const duplicateKey = Object.values(document.tasks).find(
        (task) => task.idempotency_key === envelope.idempotency_key
      );
      if (duplicateKey) {
        if (duplicateKey.capability === envelope.capability &&
            duplicateKey.task_id === envelope.task_id) return clone(duplicateKey);
        throw new Error("idempotency_key already belongs to another task");
      }

      const now = this.now();
      const task: LedgerTask = {
        ...envelope,
        state: "QUEUED",
        attempt: 0,
        max_attempts: maxAttempts,
        fencing_token: 0,
        lease_owner: null,
        lease_until_ms: null,
        created_at_ms: now,
        updated_at_ms: now,
        events: [{ type: "ENQUEUED", at_ms: now }]
      };
      document.tasks[task.task_id] = task;
      return clone(task);
    });
  }

  async get(taskId: string): Promise<LedgerTask | null> {
    return this.withLock((document) => {
      const task = document.tasks[taskId];
      return task ? clone(task) : null;
    });
  }

  async list(): Promise<LedgerTask[]> {
    return this.withLock((document) =>
      Object.values(document.tasks)
        .sort((a, b) => a.created_at_ms - b.created_at_ms || a.task_id.localeCompare(b.task_id))
        .map(clone)
    );
  }

  async claim(taskId: string, workerId: string): Promise<LedgerTask> {
    if (!workerId.trim() || workerId.length > 128) throw new Error("Invalid worker id");
    return this.withLock((document) => {
      const task = this.requireTask(document, taskId);
      if (task.state !== "QUEUED") throw new Error("Task is not queued");
      if (Date.parse(task.deadline) <= this.now()) throw new Error("Task deadline has expired");
      if (task.attempt >= task.max_attempts) throw new Error("Task retry budget exhausted");

      task.state = transitionTask(task.state, "LEASE_ACQUIRED", task.attempt, task.max_attempts);
      task.attempt += 1;
      task.fencing_token += 1;
      task.lease_owner = workerId;
      task.lease_until_ms = this.now() + this.leaseMs;
      this.record(task, "LEASE_ACQUIRED", workerId);
      return clone(task);
    });
  }

  async start(taskId: string, workerId: string, fencingToken: number): Promise<LedgerTask> {
    return this.withLock((document) => {
      const task = this.requireLease(document, taskId, workerId, fencingToken);
      if (task.state !== "LEASED") throw new Error("Task is not leased and ready to start");
      task.state = transitionTask(task.state, "STARTED", task.attempt, task.max_attempts);
      this.record(task, "STARTED", workerId);
      return clone(task);
    });
  }

  async renew(taskId: string, workerId: string, fencingToken: number): Promise<LedgerTask> {
    return this.withLock((document) => {
      const task = this.requireLease(document, taskId, workerId, fencingToken);
      task.lease_until_ms = this.now() + this.leaseMs;
      this.record(task, "LEASE_RENEWED", workerId);
      return clone(task);
    });
  }

  async complete(taskId: string, workerId: string, fencingToken: number, result: unknown): Promise<LedgerTask> {
    let encoded: string | undefined;
    try {
      encoded = JSON.stringify(result);
    } catch {
      throw new Error("Task result must be JSON-serializable");
    }
    if (encoded === undefined || Buffer.byteLength(encoded, "utf8") > MAX_RESULT_BYTES) {
      throw new Error("Task result must be JSON-serializable and no larger than 1 MB");
    }

    return this.withLock((document) => {
      const task = this.requireLease(document, taskId, workerId, fencingToken);
      if (task.state !== "RUNNING") throw new Error("Task must be running before completion");
      task.state = transitionTask(task.state, "SUCCEEDED", task.attempt, task.max_attempts);
      task.result = JSON.parse(encoded as string) as unknown;
      task.error = undefined;
      this.clearLease(task);
      this.record(task, "SUCCEEDED", workerId);
      return clone(task);
    });
  }

  async fail(
    taskId: string,
    workerId: string,
    fencingToken: number,
    error: string,
    retryable: boolean
  ): Promise<LedgerTask> {
    if (typeof error !== "string" || !error.trim()) throw new Error("A failure reason is required");
    return this.withLock((document) => {
      const task = this.requireLease(document, taskId, workerId, fencingToken);
      task.state = retryable
        ? transitionTask(task.state, "RETRYABLE_FAILURE", task.attempt, task.max_attempts)
        : transitionTask(task.state, "PERMANENT_FAILURE", task.attempt, task.max_attempts);
      task.error = error.slice(0, 2000);
      this.clearLease(task);
      this.record(task, retryable ? "RETRYABLE_FAILURE" : "PERMANENT_FAILURE", workerId, task.error);
      return clone(task);
    });
  }

  async reapExpiredLeases(): Promise<number> {
    return this.withLock((document) => {
      let reaped = 0;
      for (const task of Object.values(document.tasks)) {
        if ((task.state !== "LEASED" && task.state !== "RUNNING") ||
            task.lease_until_ms === null || task.lease_until_ms > this.now()) continue;

        // Invalidate the old worker before making the task claimable again.
        task.fencing_token += 1;
        const deadlineExpired = Date.parse(task.deadline) <= this.now();
        if (deadlineExpired) {
          task.state = transitionTask(task.state, "PERMANENT_FAILURE", task.attempt, task.max_attempts);
          task.error = "Task deadline expired while leased";
        } else if (task.attempt >= task.max_attempts) {
          task.state = transitionTask(task.state, "RETRIES_EXHAUSTED", task.attempt, task.max_attempts);
          task.error = "Lease expired after retry budget was exhausted";
        } else {
          task.state = transitionTask(task.state, "RETRYABLE_FAILURE", task.attempt, task.max_attempts);
          task.error = "Worker lease expired";
        }
        const oldOwner = task.lease_owner ?? undefined;
        this.clearLease(task);
        this.record(task, "LEASE_EXPIRED", oldOwner, task.error);
        reaped += 1;
      }
      return reaped;
    });
  }

  private now(): number {
    const value = this.clock();
    if (!Number.isFinite(value)) throw new Error("Clock returned an invalid timestamp");
    return value;
  }

  private requireTask(document: LedgerDocument, taskId: string): LedgerTask {
    const task = document.tasks[taskId];
    if (!task) throw new Error("Task not found");
    return task;
  }

  private requireLease(
    document: LedgerDocument,
    taskId: string,
    workerId: string,
    fencingToken: number
  ): LedgerTask {
    const task = this.requireTask(document, taskId);
    if (task.lease_owner !== workerId || task.fencing_token !== fencingToken) {
      throw new Error("Lease owner or fencing token is stale");
    }
    if (task.lease_until_ms === null || task.lease_until_ms <= this.now()) {
      throw new Error("Task lease has expired");
    }
    return task;
  }

  private clearLease(task: LedgerTask): void {
    task.lease_owner = null;
    task.lease_until_ms = null;
  }

  private record(task: LedgerTask, type: string, workerId?: string, detail?: string): void {
    const now = this.now();
    task.updated_at_ms = now;
    task.events.push({
      type,
      at_ms: now,
      ...(workerId ? { worker_id: workerId } : {}),
      fencing_token: task.fencing_token,
      ...(detail ? { detail } : {})
    });
  }

  private async withLock<T>(operation: (document: LedgerDocument) => T | Promise<T>): Promise<T> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const started = this.now();
    let lockHandle: Awaited<ReturnType<typeof open>> | undefined;

    while (!lockHandle) {
      try {
        lockHandle = await open(this.lockPath, "wx", 0o600);
        await lockHandle.writeFile(JSON.stringify({ pid: process.pid, at_ms: this.now() }), "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        try {
          const lockStat = await stat(this.lockPath);
          if (this.now() - lockStat.mtimeMs > this.lockStaleMs) {
            await unlink(this.lockPath);
            continue;
          }
        } catch (statError) {
          if ((statError as NodeJS.ErrnoException).code === "ENOENT") continue;
          throw statError;
        }
        if (this.now() - started >= this.lockWaitMs) {
          throw new Error("Timed out waiting for task ledger lock");
        }
        await delay(10);
      }
    }

    try {
      let document: LedgerDocument;
      try {
        const parsed: unknown = JSON.parse(await readFile(this.filePath, "utf8"));
        if (typeof parsed !== "object" || parsed === null ||
            (parsed as LedgerDocument).schema_version !== 1 ||
            typeof (parsed as LedgerDocument).tasks !== "object" ||
            (parsed as LedgerDocument).tasks === null ||
            Array.isArray((parsed as LedgerDocument).tasks)) {
          throw new Error("Task ledger file has an invalid schema");
        }
        document = parsed as LedgerDocument;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        document = { schema_version: 1, tasks: {} };
      }

      const result = await operation(document);
      const tempPath = `${this.filePath}.${process.pid}.${this.now()}.tmp`;
      try {
        await (await open(tempPath, "wx", 0o600)).close();
        const handle = await open(tempPath, "w", 0o600);
        try {
          await handle.writeFile(JSON.stringify(document, null, 2) + "\n", "utf8");
          await handle.sync();
        } finally {
          await handle.close();
        }
        await rename(tempPath, this.filePath);
      } catch (error) {
        await unlink(tempPath).catch(() => undefined);
        throw error;
      }
      return result;
    } finally {
      await lockHandle.close();
      await unlink(this.lockPath).catch(() => undefined);
    }
  }
}
