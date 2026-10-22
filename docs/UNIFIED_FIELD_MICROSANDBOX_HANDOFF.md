# Unified Field Micro-Sandbox Handoff

Status: active engineering handoff; protocol and implementation are not yet production-complete.
Coordination branch: `work/unified-field-resilience-spec`
Parent review: [PR #9](https://github.com/HeavenzFire/Sovereign-Node-/pull/9)

## Objective

Coordinate the existing HeavenzFire local Unified Field runtime with repository-scoped micro-sandbox work, using one durable task identity and independently checkable evidence. Do not treat a Git branch, directory, prompt, or model role as proof of OS/process isolation or an autonomous agent.

## Four work lanes and integration gate

| Lane | Assignment | Required artifact |
|---|---|---|
| Architect | Map existing contracts, dependencies, trust boundaries, and acceptance criteria before changing code. | `architect.json` |
| Builder | Implement the smallest bounded change in a task-specific workspace; do not edit another lane's files. | Patch/diff plus `builder.json` |
| Adversarial verifier | Independently inspect the diff and test negative paths, stale state, duplicate delivery, retry exhaustion, and authorization boundaries. | `verifier.json` |
| Integrator | Reconcile disagreements, run the authoritative tests, record hashes and exit codes, and state whether the acceptance gate passed. | `integrator.json` |

These are logical lanes until separate worker processes/hosts are measured and identified. A single process running four concurrent prompts is not four independent agents. The integration gate must preserve dissent and mark unresolved high-severity findings as blocked.

## Micro-sandbox contract

Every task must carry:
- `task_id`: stable UUID or repository issue ID, reused on retry.
- `parent_task_id`: parent objective, or null for a root task.
- `sandbox_id`: unique task workspace identifier.
- `branch` and `base_sha`: exact source baseline.
- `capabilities`: explicit allowlist; default read/test only.
- `approval_state`: pending, approved, or rejected.
- `deadline_at`, `attempt`, `max_attempts`, and `idempotency_key`.
- `acceptance_checks[]`: commands or assertions with expected outcomes.
- `evidence[]`: artifact path/URL, SHA-256, observed timestamp, exit code, and concise result.
- `status`: proposed, approved, running, completed, failed, review_required, or rejected.

A micro-sandbox is not considered isolated merely because it has a unique ID. Isolation evidence must identify the enforcement boundary (separate process/container/VM or restricted worktree), permitted filesystem/network scope, and teardown/cleanup result. Never give a worker secrets or unrestricted shell/network access by default.

## Handoff and execution protocol

1. Architect records baseline commit SHA, touched paths, dependencies, and acceptance checks.
2. Root conductor creates one task envelope and dispatches bounded, non-overlapping work.
3. Builder produces a diff; tests run only within the approved scope.
4. Verifier receives the diff and acceptance criteria, not the builder's conclusion alone; verifier may reject.
5. Integrator runs authoritative tests, inspects the working tree/diff, and checks report integrity.
6. Persist the result before reporting completion. A successful test process is not proof that remote workers or a second ChatGPT instance participated.
7. If a remote instance participates, it must append its own observed artifact URLs, commit SHA, tests, and dissent to this handoff or the associated PR. Do not fabricate its participation or speak on its behalf.

## Required adversarial cases

- invalid/unknown state or event;
- retry exhaustion and non-retryable failure;
- duplicate task delivery and idempotency-key reuse;
- stale lease/fencing token after reassignment;
- process crash during a task and coordinator restart;
- denied capability or approval-pending task;
- malformed or missing evidence and digest mismatch;
- sandbox escape attempts and out-of-scope file writes;
- exhausted deadline and bounded retry behavior.

## Current verified baseline

- The local Unified Field codebase defines architecture, implementation, security, and verification lanes and a synthesis stage. A local live run must be recorded separately from GitHub CI.
- The GitHub branch contains a task-state machine, task/capability contract, retry helper, and unit tests. Their presence is not equivalent to a successful CI run.
- The existing 200-equation experiment's first pass is family-level smoke validation, not 200 formula-specific mathematical proofs.
- No claim is made here that the other ChatGPT instance, isolated containers, or four separate local model processes have participated.

## Completion gate

The milestone remains **in progress** until (a) tests pass on this branch, (b) retry/lease/state invariants have negative tests, (c) local live execution has a persisted verifiable report, and (d) any claimed separate agent/sandbox has process or host identity plus independent evidence.
