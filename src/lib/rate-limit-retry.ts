export type RateLimitError = Error & {
  status?: number;
  retryAfter?: string | number;
};

export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function retryAfterMs(value: string | number | undefined, now: number): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.ceil(value * 1000);
  }
  if (typeof value === "string") {
    const seconds = Number(value);
    if (value.trim() !== "" && Number.isFinite(seconds) && seconds >= 0) {
      return Math.ceil(seconds * 1000);
    }
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.max(0, date - now);
  }
  return undefined;
}

function isRetryable(error: unknown): error is RateLimitError {
  if (typeof error !== "object" || error === null) return false;
  const status = (error as RateLimitError).status;
  return status === 429 || (typeof status === "number" && status >= 500 && status <= 599);
}

/**
 * Retries a single request operation on HTTP 429 and transient 5xx errors.
 * Honors Retry-After when supplied; otherwise uses bounded exponential backoff
 * with jitter. This helper does not bypass provider quotas or create identities.
 */
export async function withRateLimitRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 10_000;
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError("maxAttempts must be a positive integer");
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0 ||
      !Number.isFinite(maxDelayMs) || maxDelayMs < 0) {
    throw new RangeError("delay limits must be finite and non-negative");
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (!isRetryable(error) || attempt === maxAttempts) throw error;
      const serverDelay = retryAfterMs(error.retryAfter, now());
      const exponentialCap = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const jitter = Math.floor(Math.max(0, Math.min(1, random())) * exponentialCap);
      await sleep(serverDelay === undefined ? jitter : Math.min(maxDelayMs, serverDelay));
    }
  }

  throw new Error("Unreachable retry state");
}
