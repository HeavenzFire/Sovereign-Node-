# Unified Field: Worker Coordination and Failure Resilience

Status: implementation specification  
Scope: first milestone for HeavenzFire Unified Field  
Branch: `work/unified-field-resilience-spec`

## Goal

Keep useful work moving when a worker, process, network link, or coordinator becomes unavailable, without silently duplicating side effects or claiming that an unverified worker is alive.

The gyroid/fractal topology is a placement and visualization model, not a correctness guarantee. Correctness comes from explicit leases, durable task state, idempotency, bounded retries, and observable failure handling.

## First-milestone invariants

1. **Truthful liveness:** a node is `ALIVE` only while its heartbeat is fresh and its health probe succeeds. Otherwise report `SUSPECT`, then `DARK`, with a reason and timestamp.
2. **Single task authority:** each task has one current lease owner and a monotonically increasing fencing token. Stale owners cannot commit after a lease has been reassigned.
3. **At-least-once delivery, idempotent effects:** workers may receive a task more than once. Every task has a stable `task_id`; effectful handlers must deduplicate by that ID or use an idempotency key.
4. **Bounded retries:** retries use exponential backoff with jitter, a maximum attempt count, and a deadline. Exhausted tasks enter `FAILED` or `DEAD_LETTER`; no infinite retry loops.
5. **Failure isolation:** a failing node or route is quarantined after a configurable threshold. Other healthy workers remain eligible.
6. **Durable state:** task state and lease changes are persisted before being reported as committed. In-memory queues alone do not satisfy this invariant.
7. **Least privilege:** workers receive only the tools and scopes required by their task. Network, credential, administrative, and destructive actions require a separate approval policy.
8. **Observable decisions:** every assignment, heartbeat expiry, retry, lease takeover, quarantine, and recovery emits a structured event with correlation IDs.
9. **No false redundancy claims:** multiple workers count as independent redundancy only when their failure domains are meaningfully separate (process, host, network, credentials, or provider).
10. **Graceful degradation:** if the coordinator is unavailable, workers must not invent assignments. They finish only work whose lease and fencing token remain valid, then reconnect and reconcile.

## Minimal data model

- `Node`: `node_id`, `role`, `capabilities[]`, `failure_domain`, `status`, `last_heartbeat_at`, `health_reason`, `capacity`, `version`.
- `Task`: `task_id`, `type`, `input_ref`, `state`, `priority`, `attempt`, `max_attempts`, `deadline_at`, `idempotency_key`, `created_at`, `updated_at`.
- `Lease`: `task_id`, `node_id`, `lease_until`, `fencing_token`, `renewed_at`.
- `TaskEvent`: `event_id`, `task_id`, `node_id`, `event_type`, `timestamp`, `correlation_id`, `details`.

Suggested task states: `QUEUED` → `LEASED` → `RUNNING` → `SUCCEEDED`; recoverable failures return to `QUEUED`; terminal outcomes are `FAILED` or `DEAD_LETTER`; cancellation is `CANCELLED`. State transitions must be validated centrally.

## Node state machine

- `ALIVE`: heartbeat age is within the configured threshold and health checks pass.
- `SUSPECT`: heartbeat is late or health checks fail; stop assigning new work while allowing a short grace period.
- `DARK`: failure is confirmed after the grace period; expire leases only according to the lease protocol and make eligible tasks available for reassignment.
- `RECOVERING`: node reconnected but has not reconciled task leases and local work.
- `ALIVE`: return only after reconciliation and health checks pass.

Transitions must include `reason`, `observed_at`, and the relevant heartbeat/health evidence. A stale heartbeat by itself is not proof of permanent failure.

## Scheduling and recovery algorithm

1. Filter workers by `ALIVE`, required capabilities, capacity, policy, and failure-domain constraints.
2. Prefer the least-loaded eligible worker; use deterministic tie-breaking for reproducibility.
3. Atomically create a lease and increment the task's fencing token before dispatch.
4. Worker renews the lease while running and checks cancellation/deadline between bounded work units.
5. If a lease expires, the coordinator atomically invalidates the old token before requeueing or reassigning the task.
6. A worker must present the current fencing token to commit task results. Reject stale-token commits.
7. Retry transient failures only; classify validation, permission, and deterministic input errors as non-retryable unless explicitly configured.
8. Apply per-node and per-route circuit breakers. Probe a quarantined route at a controlled rate and restore it only after successful probes.
9. On coordinator recovery, reconcile persisted task state and leases before accepting new dispatches.

## Routing and redundancy

Represent workers and communication paths as a graph. Route selection should score eligible paths using observed latency, recent failure rate, capacity, and policy constraints. Keep topology separate from the task-state authority.

For the first implementation, prefer a small, testable routing policy over a simulated swarm of many agents. Add alternate routes only when they terminate at independently useful workers and preserve the same task identity and authorization boundary. Never replicate secrets or unrestricted tool access merely to increase node count.

## Verification plan (automated)

| Test | Fault injection | Required assertion |
|---|---|---|
| Heartbeat timeout | Stop heartbeat from one worker | Worker becomes `SUSPECT`, then `DARK` after configured grace; reason is recorded |
| Worker crash | Kill worker while task is leased | Lease expires; eligible task is reassigned; old worker cannot commit |
| Stale lease | Resume old worker after reassignment | Old fencing token is rejected |
| Duplicate delivery | Deliver the same task twice | One logical side effect; duplicate is recorded |
| Transient route failure | Drop messages on one route | Circuit opens; scheduler selects a healthy eligible route |
| Total route partition | Disconnect all routes to a worker | No false `ALIVE` claim; task remains recoverable after deadline/lease rules |
| Coordinator restart | Restart coordinator during running tasks | Persisted state is recovered and reconciled before dispatch |
| Retry exhaustion | Force repeated transient failures | Attempts stop at configured limit; task enters terminal/dead-letter state |
| Non-retryable failure | Return permission/validation error | No retry storm; actionable failure reason is stored |
| Capacity pressure | Mark all workers at capacity | No oversubscription; tasks remain queued with a reason |
| Cancellation | Cancel a running task | Worker stops at a safe checkpoint; no later commit is accepted |
| Failure-domain check | Mark candidates as same host/provider | Redundancy policy does not count them as independent replicas |

## Acceptance criteria for milestone 1

- Unit tests cover all state transitions and reject illegal transitions.
- Integration tests exercise crash, partition, duplicate delivery, lease takeover, and coordinator restart.
- Tests use deterministic clocks and seeded jitter; no real sleeps are required for unit tests.
- Every terminal task has a final reason and a traceable event history.
- Dashboard reports actual heartbeat/health evidence and queue/lease state, not inferred activity.
- No task is marked successful until its result is durably committed with the current fencing token.

## Implementation sequence

1. Inspect the existing server routes, persistence layer, and dashboard data flow.
2. Add typed node/task/lease/event schemas and state-transition validation.
3. Add persistence-backed lease acquisition, renewal, expiry, and fencing-token checks.
4. Add heartbeat monitoring and truthful `ALIVE/SUSPECT/DARK/RECOVERING` reporting.
5. Add bounded retry policy, idempotency keys, and route circuit breakers.
6. Wire the dashboard to the same persisted status/event APIs.
7. Add fault-injection integration tests and document measured results.

This document is a design specification, not a claim that the behaviors above are already implemented or tested.
