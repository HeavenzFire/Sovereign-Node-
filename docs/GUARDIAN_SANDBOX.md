# HeavenzFire Repository Guardians and Micro-Sandboxes

## Objective

Detect unauthorized repository changes and integrity risks with evidence. A guardian reports observable facts; it does not assume that an agent's own status message is trustworthy.

## Trust boundaries

- **Control plane:** human-owned GitHub settings, branch protection/rulesets, required checks, app installations, and credential rotation.
- **Guardian plane:** read-only scanners, scheduled checks, and audit reports. The guardian token must have the minimum read permissions needed.
- **Worker micro-sandbox:** one disposable job/worktree/container per task, no inherited secrets by default, no write-capable GitHub token, and no access to sibling workers.
- **Promotion gate:** workers submit patches or pull requests. A separate verifier runs tests and inspects the diff. Only a human or an explicitly authorized release identity may merge.
- **Evidence ledger:** record repository, commit SHA, changed paths, actor/event, scan result, timestamp, and artifact/report link. Never record credentials or secret values.

## Micro-sandbox contract

Each worker receives a narrowly scoped task envelope:

- unique task and sandbox IDs;
- pinned base commit SHA;
- explicit allowed paths and capabilities;
- bounded CPU, memory, runtime, and network egress;
- read-only repository credentials unless a task explicitly requires a narrowly scoped write;
- isolated temporary filesystem and process namespace;
- no ambient personal access tokens, SSH keys, cloud credentials, or host mounts;
- output limited to a patch, test results, and structured evidence.

Destroy the sandbox after collecting its artifacts. A worker cannot spawn workers with broader privileges. A “clown car” fan-out is a scheduler creating many disposable, bounded workers—not one worker receiving thousands of credentials or unrestricted execution.

## Guardian checks

Run on pull requests, pushes, and a scheduled cadence:

1. Validate the patch and reject whitespace/conflict-marker problems.
2. Scan changed files for high-confidence credential material (private-key blocks and known token prefixes); report file/line, never the secret itself.
3. Flag changes to workflows, dependency manifests/lockfiles, authorization gates, release scripts, and repository permissions for mandatory human review.
4. Run project tests, type checks, build, and dependency audit where supported.
5. Emit a machine-readable report keyed to the exact commit SHA.
6. Fail closed when required checks cannot run; distinguish not-run from passed.
7. Keep the scanner read-only. Alerting or quarantine actions must use a separate, narrowly scoped identity and be explicitly configured.

## Repository-wide deployment

A workflow inside one repository only guards that repository. To cover hundreds or thousands of repositories, deploy a dedicated GitHub App with read-only metadata, contents, pull-request, and audit-event permissions only where needed. Install it on an explicit repository allowlist. Receive webhooks, verify their HMAC signatures, persist event IDs to prevent replay, and periodically reconcile webhook events against the GitHub API. Never use a broad personal access token as the fleet-wide guardian credential.

## Integrity and corruption response

- Preserve the suspicious commit SHA and event metadata before changing anything.
- Compare against the last known-good commit and inspect the full diff, workflow changes, dependency changes, and actor identity.
- Do not auto-rewrite history or delete suspicious branches.
- If compromise is credible, revoke the specific app/token, disable its installation, pause worker dispatch, and alert the owner.
- Restore from a reviewed known-good commit only after preserving evidence.
- A clean scan is not proof of no compromise; use GitHub rulesets, protected branches, required reviews, secret scanning, and audit logs as independent controls.

## Limitations

This document defines a design contract, not a claim that continuous monitoring, a GitHub App, sandbox isolation, alert delivery, or fleet-wide deployment already exists. Scheduled GitHub Actions only run when configured and enabled, and a workflow cannot independently protect its own settings from an administrator or attacker who can alter the repository. Configure repository rulesets outside the worker's permissions.
