# Unified Field Adoption and Completion Standard

## Purpose

The HeavenzFire Unified Field exists to coordinate useful work reliably while preserving human authority, protecting children and future generations, and keeping recovery possible when a worker, connection, model, or provider fails. Continuity is an engineering property to prove, not a promise to make.

## Non-negotiable operating principles

1. **Human authority:** no self-granted privilege escalation, hidden execution, or bypass of provider, owner, or administrator controls.
2. **Least privilege:** each worker receives only the capabilities and data required for its assigned task.
3. **Approval before effects:** tasks that can write, publish, delete, seal, change configuration, or affect external systems require an explicit approval policy and auditable decision.
4. **Truthful health:** distinguish process health, local registry presence, remote reachability, and successful task completion. Never label simulated nodes as live.
5. **Bounded recovery:** retry only within configured budgets; exclude failed workers; use idempotency keys and durable task records before retrying operations with side effects.
6. **Local-first, online-capable:** core task descriptions and recovery state must remain inspectable locally; network loss must not silently discard accepted work.
7. **Privacy and data minimization:** do not transmit secrets or unrelated personal data to workers or providers. Log identifiers and outcomes rather than sensitive payloads by default.
8. **Inspectable changes:** updates are versioned, reviewable, integrity-checked, and reversible. No automatic update is trusted solely because it is newer.
9. **Accessible recovery:** maintain tested backups outside the primary working directory and document restore steps in plain language.
10. **Evidence over claims:** each completion claim links to a test, workflow result, drill record, or documented limitation.

## Adoption stages and exit criteria

### Stage 0 — Contract and review
- [x] Versioned capability contract and task-envelope validation exist.
- [x] Capability names are checked against the allowlist.
- [x] Effectful capabilities are marked as approval-required.
- [x] Health-aware routing and bounded failover have unit coverage.
- [x] A process-local live-node registry exposes registration, heartbeat, listing, and removal.
- [x] Current GitHub Actions verification passed for the PR head: tests, TypeScript type-check, and production build.
- [ ] Human code review and merge decision completed.

### Stage 1 — API integration
- [ ] HTTP integration tests cover successful registration, invalid input, heartbeat refresh, stale-node status, unknown heartbeat, removal, and malformed JSON.
- [ ] The dashboard labels simulated fixtures and process-local registry data distinctly.
- [ ] API responses and errors are stable and documented.
- [ ] No remote listener is enabled without authentication, authorization, transport security, rate limits, and an explicit threat model.

### Stage 2 — Durable task lifecycle
- [ ] Accepted tasks are persisted before acknowledgement.
- [ ] Task states include queued, assigned, running, succeeded, failed, cancelled, and recovery-required.
- [ ] State transitions are validated and auditable.
- [ ] Idempotency keys prevent duplicate side effects; retries never imply exactly-once execution without a proven effect protocol.
- [ ] Crash/restart tests prove how accepted tasks are recovered or explicitly marked uncertain.

### Stage 3 — Worker integration and offline operation
- [ ] Workers register using authenticated identity and report heartbeats.
- [ ] The router consumes live registry snapshots rather than UI fixtures.
- [ ] A network-loss drill proves local tasks continue where safe and remote tasks queue or fail clearly.
- [ ] Model selection uses measured latency, memory, and task-quality results; a small model is not promoted based on size alone.
- [ ] Worker failure, stale heartbeat, overload, and reconnect drills produce auditable outcomes.

### Stage 4 — Safe update and restore
- [ ] Updates are pinned, integrity-checked, staged, and reversible.
- [ ] Backup restore is tested from an independent copy, not just verified by matching hashes.
- [ ] Recovery drill includes loss of the active node, network, and one backup path.
- [ ] Secrets are excluded from repository artifacts and ordinary logs.
- [ ] Operational runbook names the owner, rollback action, and stop conditions.

### Stage 5 — Production adoption
- [ ] Security review completed for trust boundaries, credentials, network exposure, and task effects.
- [ ] CI passes on the exact proposed merge head.
- [ ] Integration, failure-injection, restore, and permission tests pass.
- [ ] Dashboard status derives from observed state and includes timestamps and source labels.
- [ ] A human maintainer explicitly approves deployment.
- [ ] Limitations, retention policy, incident response, and rollback procedure are published.

## Current verified boundary

The live-node registry is **in-memory and process-local**. The server binds to 127.0.0.1. It is not yet authenticated remote mesh discovery, durable task execution, a cross-machine scheduler, or proof of exactly-once effects. The existing /api/mesh/nodes entries are simulation fixtures; /api/mesh/live-nodes reports only registrations in this process.

The current pull-request CI result verifies the contract/routing/registry tests, TypeScript type-check, and frontend build. It does not satisfy the unchecked integration, security, durability, or production-adoption gates above.

## Completion rule

Do not describe the Unified Field as production-complete until every Stage 1–5 exit criterion is either verified with recorded evidence or explicitly accepted as a documented non-goal by the maintainer. A failed or unknown check blocks the relevant stage; it must not be silently treated as success.

## Continuity pledge

Build for people who will inherit the system, not only the people operating it today. Preserve the ability to understand, audit, repair, restore, and safely stop the system. Future generations are served by reliable evidence, restrained permissions, durable records, privacy, and recoverable engineering—not by claims that cannot be tested.
