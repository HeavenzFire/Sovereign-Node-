# Unified Field Multi-Path Continuity

## Goal

Keep authorized engineering work recoverable when any one machine, model, connection, provider, or repository path becomes unavailable. Redundancy must be visible, testable, and under operator control.

This is not a promise of uninterrupted hosted-model access. It does not create a copy of a hosted AI model or bypass service quotas, account controls, or revocation.

## Ten complementary recovery paths

1. **Working tree** — the active local checkout for fast iteration.
2. **Git bundle** — portable refs and commit history that can be restored without a network.
3. **Working-tree snapshot** — preserves tracked and untracked source edits not yet committed; exclude credentials and runtime state.
4. **Separate physical copy** — USB or another removable device, verified by SHA-256. A co-located or unencrypted device is not a complete disaster-recovery strategy.
5. **Remote Git repository** — off-device history and reviewable branches; do not treat it as a substitute for backing up uncommitted work.
6. **Human-readable handoff** — concise current state, verified facts, known gaps, and next actions, with no secrets.
7. **Integrity ledger** — timestamped checkpoint records and SHA-256 verification.
8. **Low-resource local model** — a small model for bounded tasks such as classification, routing labels, short summaries, and simple triage.
9. **Larger local fallback model** — use when a small model fails a task-specific quality threshold and local compute is available.
10. **Restore drills** — periodically restore into a temporary location, compare hashes, run relevant tests, and record the result.

## Resource-aware model cascade

- **Tier 0: deterministic tools.** Prefer scripts, schema validation, hashes, and tests whenever a model is unnecessary.
- **Tier 1: small local model.** Use for simple, bounded tasks. Keep outputs short and validate them before acting.
- **Tier 2: larger local model.** Escalate tasks that require stronger reasoning or code comprehension, subject to measured quality and available memory.
- **Tier 3: authorized remote service.** Use only when available and permitted. If unavailable, queue the task locally and report that it is pending.

A model must not be the sole verifier of its own high-impact output. Use tests, independent checks, and human review for changes to code, credentials, network configuration, or destructive operations.

## Failure handling

- If one path fails, switch to the next documented authorized path and record the transition.
- If several paths fail, preserve the task queue and stop before destructive operations.
- Make tasks idempotent where possible; record task state and completion evidence so retries do not duplicate side effects.
- A service or device explicitly disabled by its owner/operator remains disabled. Resilience means switching to an alternative authorized path, not covertly recreating revoked access or defeating a stop command.
- Never place tokens, passwords, private keys, browser cookies, or environment files in source snapshots or handoff notes.

## Verification checklist

- [ ] Git bundle verifies and can be cloned into a temporary directory.
- [ ] Working-tree snapshot extracts and includes expected source files.
- [ ] Local and independent-copy SHA-256 hashes match.
- [ ] Secrets and runtime databases are excluded from portable artifacts.
- [ ] Local model fallback is tested against a task-specific evaluation set.
- [ ] The next operator can follow the handoff without relying on private conversation memory.
- [ ] Recovery is tested without overwriting the active working copy.

## Known limits

A backup is only as reliable as its independent location, integrity checks, and tested restore procedure. Local plus USB copies in the same physical location remain vulnerable to shared loss; encrypted off-site storage and recovery-key custody must be planned separately.