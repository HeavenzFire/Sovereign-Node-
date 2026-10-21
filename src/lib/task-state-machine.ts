export type TaskState =
  | "QUEUED"
  | "LEASED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "DEAD_LETTER"
  | "CANCELLED";

export type TaskEvent =
  | "LEASE_ACQUIRED"
  | "STARTED"
  | "SUCCEEDED"
  | "RETRYABLE_FAILURE"
  | "PERMANENT_FAILURE"
  | "RETRIES_EXHAUSTED"
  | "CANCELLED";

const TRANSITIONS: Readonly<Record<TaskState, readonly TaskEvent[]>> = {
  QUEUED: ["LEASE_ACQUIRED", "CANCELLED"],
  LEASED: ["STARTED", "RETRYABLE_FAILURE", "PERMANENT_FAILURE", "CANCELLED"],
  RUNNING: ["SUCCEEDED", "RETRYABLE_FAILURE", "PERMANENT_FAILURE", "CANCELLED"],
  SUCCEEDED: [],
  FAILED: [],
  DEAD_LETTER: [],
  CANCELLED: []
};

export function transitionTask(
  current: TaskState,
  event: TaskEvent,
  attempt: number,
  maxAttempts: number
): TaskState {
  if (!Number.isInteger(attempt) || attempt < 0) {
    throw new RangeError("attempt must be a non-negative integer");
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError("maxAttempts must be a positive integer");
  }
  if (!TRANSITIONS[current].includes(event)) {
    throw new Error(`Illegal task transition: ${current} + ${event}`);
  }

  switch (event) {
    case "LEASE_ACQUIRED":
      return "LEASED";
    case "STARTED":
      return "RUNNING";
    case "SUCCEEDED":
      return "SUCCEEDED";
    case "RETRYABLE_FAILURE":
      return attempt < maxAttempts ? "QUEUED" : "DEAD_LETTER";
    case "PERMANENT_FAILURE":
      return "FAILED";
    case "RETRIES_EXHAUSTED":
      return "DEAD_LETTER";
    case "CANCELLED":
      return "CANCELLED";
  }
}
