# Unified Field: Engineering Principles and Verification Contract

## Purpose

Build a local-first, auditable multi-agent coordination system that makes reliable progress under bounded failure while respecting human agency, least privilege, privacy, and data integrity.

## Higher-order design principles

These principles translate the project's ethical commitments into testable engineering rules. "Divine principles" is treated as the project's values vocabulary, not as a claim that software has supernatural authority.

1. **Truth before claims** — distinguish planned, executed, and verified states. Never report success without evidence.
2. **Love expressed as care** — protect people, children, and vulnerable users; minimize foreseeable harm and unnecessary data collection.
3. **Honor and integrity** — preserve provenance, credit collaborators, disclose limitations, and never fabricate benchmarks or novelty claims.
4. **Agency and consent** — require explicit authorization for destructive, privileged, credential-sensitive, or external actions.
5. **Non-extraction** — minimize surveillance and data retention; do not use users' private data for unrelated purposes.
6. **Least privilege and reversibility** — grant only necessary capabilities, scope operations narrowly, and provide rollback where feasible.
7. **Humility and correction** — accept independent review, adversarial tests, failure reports, and evidence that disproves a hypothesis.
8. **Stewardship across generations** — favor maintainable interfaces, accessible documentation, safe defaults, and durable knowledge over lock-in.

## Higher-order functional architecture

The system separates policy, coordination, execution, and evidence:

- **Policy gate:** validates task envelopes, capability scopes, approval requirements, deadlines, and quotas before work is scheduled.
- **Coordinator:** chooses eligible workers using fresh health signals and explicit capability declarations; records why a worker was selected.
- **Task ledger:** persists state transitions, idempotency identity, retry budget, lease owner, lease expiry, fencing token, and result provenance.
- **Worker adapter:** executes only the declared task contract; worker output is untrusted until checked.
- **Independent verifier:** checks output against task-specific acceptance criteria and, for high-impact work, uses an independent implementation or review path.
- **Evidence journal:** records timestamps, versions, inputs/outputs hashes where appropriate, checks, failures, approvals, and rollback references without logging secrets.
- **Recovery supervisor:** reaps expired leases, fences stale workers, retries only retryable failures within budget, and dead-letters exhausted work.
- **Human control plane:** provides status, pause/cancel, audit inspection, and approval/denial interfaces.

## Required invariants

1. An unapproved sensitive task never executes.
2. A task identifier and idempotency key cannot silently refer to different work.
3. A stale lease holder cannot commit a result after reassignment.
4. Every state change is legal, persisted, and attributable.
5. A task is not "complete" until its acceptance checks pass.
6. Retries are bounded and distinguish transient from permanent failures.
7. A worker is eligible only while its heartbeat is fresh and its capabilities match.
8. Secrets do not enter ordinary logs, prompts, or public artifacts.
9. Coordinator health does not imply worker health; worker health does not imply task success.
10. Recovery and restart behavior is tested from persisted state, not only in-memory mocks.

## Current implementation boundary

The current work branch adds a durable JSON-backed task ledger, task lifecycle HTTP routes, lease recovery, and unit tests. This is a single-host persistence mechanism, not a distributed database or consensus protocol. The ledger and routes must pass CI and security review before being treated as production-ready. Multi-process lock correctness, atomic filesystem durability across power loss, authorization of worker lifecycle routes, registry API compatibility, and end-to-end execution integration remain explicit verification items.

## Acceptance and release gates

- Unit tests cover idempotency, illegal transitions, stale fencing tokens, lease expiry, retry exhaustion, result bounds, and concurrent writes.
- Integration tests cover HTTP authorization, worker capability checks, restart recovery, and end-to-end task execution.
- Failure injection covers worker death, duplicate delivery, timeout, corrupted ledger, and coordinator restart.
- Security review checks route authorization, input validation, log redaction, path handling, lock behavior, and dependency advisories.
- Benchmarks compare against a simple baseline and report workload, hardware, sample count, percentiles, error bars, and reproducible commands.
- Release notes distinguish implemented, tested, benchmarked, externally reviewed, and hypothesized capabilities.
- Any claim of being "first" requires a scoped prior-art search and independent novelty review.

## Operational status vocabulary

- **Planned:** design exists; no code evidence yet.
- **Implemented:** code is committed.
- **Tested:** specified tests pass in a recorded environment.
- **Verified:** independent checks and failure-path evidence support the claim.
- **Production-ready:** security, operational, recovery, and documentation gates are met.
- **Unknown/blocked:** evidence is missing or the environment could not be inspected.

No status may be silently upgraded from one level to the next.
