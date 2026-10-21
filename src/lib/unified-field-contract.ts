export type Capability = {
  name: string;
  version: "1.0.0";
  approval_required: boolean;
};

export const UNIFIED_FIELD_CAPABILITIES: readonly Capability[] = Object.freeze([
  { name: "health.read", version: "1.0.0", approval_required: false },
  { name: "capabilities.read", version: "1.0.0", approval_required: false },
  { name: "vault.read", version: "1.0.0", approval_required: false },
  { name: "seal.create", version: "1.0.0", approval_required: true },
  { name: "trinary.decide", version: "1.0.0", approval_required: true },
  { name: "engine.stream", version: "1.0.0", approval_required: true }
]);

export function isKnownCapability(name: unknown): name is string {
  return typeof name === "string" &&
    UNIFIED_FIELD_CAPABILITIES.some((capability) => capability.name === name);
}

export function requiresApproval(name: unknown): boolean {
  if (!isKnownCapability(name)) {
    throw new Error("Unknown capability");
  }
  return UNIFIED_FIELD_CAPABILITIES.find((capability) => capability.name === name)!.approval_required;
}

export function isValidTaskEnvelope(value: unknown): value is {
  task_id: string;
  capability: string;
  idempotency_key: string;
  deadline: string;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const task = value as Record<string, unknown>;
  if (typeof task.task_id !== "string" || task.task_id.trim().length < 1 || task.task_id.length > 128) return false;
  if (!isKnownCapability(task.capability)) return false;
  if (typeof task.idempotency_key !== "string" || task.idempotency_key.trim().length < 1 || task.idempotency_key.length > 128) return false;
  if (typeof task.deadline !== "string" || task.deadline.length > 40) return false;
  const deadlineMs = Date.parse(task.deadline);
  return Number.isFinite(deadlineMs) && deadlineMs > 0;
}
