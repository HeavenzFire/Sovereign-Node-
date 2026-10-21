# Unified Field Interoperability Contract

Status: draft implementation contract  
Scope: connect HeavenzFire nodes through explicit capability discovery, health reporting, and auditable task handoff.

## Non-goals

- No claim that separate ChatGPT conversations share state or execute as a single process.
- No implicit trust between agents, nodes, repositories, or tools.
- No autonomous destructive, financial, credential, or network-administration actions.

## Node contract

Every node should expose:

- `GET /health` — JSON containing `status`, `node_id`, `version`, `uptime_seconds`, and `capabilities`.
- `GET /api/mesh/nodes` — known nodes with last-seen time and health state.
- `GET /api/capabilities` — machine-readable capability declarations with input/output schema versions.
- `POST /api/tasks` — submit a bounded task with a unique `task_id`, requested capability, deadline, and idempotency key.
- `GET /api/tasks/:task_id` — inspect task state and evidence references.

## Interoperability rules

1. Bind only to loopback by default. Remote exposure requires explicit configuration and authentication.
2. Validate every request against a versioned schema; reject unknown capability names and oversized payloads.
3. Enforce per-task deadlines, maximum tool-call counts, and cancellation.
4. Record append-only audit events for task submission, approval, execution, result, and failure. Do not log secrets.
5. Treat node health as a time-bounded observation, not a permanent ALIVE assertion.
6. Mark external effects as approval-required; never infer consent from a task description alone.
7. Use stable task IDs and idempotency keys to make retries safe.
8. Report partial availability honestly: one healthy node does not imply the mesh is healthy.

## Task lifecycle

`queued -> approved -> running -> succeeded | failed | cancelled | timed_out`

An approval-required task remains queued until an explicit approval record exists. Terminal states are immutable; retries create a new attempt linked to the original task.

## Minimum acceptance tests

- Health response validates against the schema.
- Unknown capabilities and malformed payloads return 4xx without executing work.
- Expired deadlines transition to `timed_out`.
- Duplicate idempotency keys do not repeat side effects.
- Approval-required tasks cannot run before approval.
- Audit records omit configured secret patterns.
- Stale node observations become `unknown`, not `healthy`.
- A node failure does not fabricate success for the overall mesh.

## Evidence standard

A feature is complete only when code, automated tests, and reproducible test output exist. Documentation, architecture diagrams, and successful HTTP status codes alone are not proof of end-to-end operation.
