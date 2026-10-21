/**
 * Deterministic, side-effect-free worker selection for Unified Field tasks.
 * This module does not execute tasks or claim that a node is live; callers
 * must supply fresh health observations from their transport/heartbeat layer.
 */

export type WorkerHealth = "online" | "degraded" | "offline";

export type WorkerCandidate = {
  id: string;
  health: WorkerHealth;
  capabilities: readonly string[];
  activeTasks: number;
};

export type WorkerSelection =
  | { selected: true; workerId: string; reason: "least-loaded-capable-online-worker" }
  | { selected: false; reason: "no-eligible-worker" };

export function selectWorker(
  capability: string,
  workers: readonly WorkerCandidate[]
): WorkerSelection {
  const eligible = workers
    .filter((worker) =>
      worker.health === "online" &&
      worker.capabilities.includes(capability) &&
      Number.isSafeInteger(worker.activeTasks) &&
      worker.activeTasks >= 0
    )
    .slice()
    .sort((a, b) => a.activeTasks - b.activeTasks || a.id.localeCompare(b.id));

  if (eligible.length === 0) {
    return { selected: false, reason: "no-eligible-worker" };
  }

  return {
    selected: true,
    workerId: eligible[0].id,
    reason: "least-loaded-capable-online-worker"
  };
}

export type RetryDecisionInput = {
  workerFailure: boolean;
  idempotent: boolean;
  attempt: number;
  maxAttempts: number;
  approvalRequired: boolean;
  approvalGranted: boolean;
};

export function shouldRetryTask(input: RetryDecisionInput): boolean {
  if (!input.workerFailure) return false;
  if (!input.idempotent) return false;
  if (!Number.isSafeInteger(input.attempt) || input.attempt < 1) return false;
  if (!Number.isSafeInteger(input.maxAttempts) || input.maxAttempts < 1) return false;
  if (input.attempt >= input.maxAttempts) return false;
  if (input.approvalRequired && !input.approvalGranted) return false;
  return true;
}
