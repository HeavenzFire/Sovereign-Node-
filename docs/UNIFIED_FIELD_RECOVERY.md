# Unified Field Recovery and Continuity

This document is the handoff point for continuing work after a lost chat, interrupted network connection, unavailable model, or workstation failure.

## Current checkpoint

- Repository: `HeavenzFire/Sovereign-Node-`
- Feature branch: `feat/unified-field-resilient-routing`
- Recovery branch: `backup/unified-field-routing-2026-10-21`
- Checkpoint commit before this document: `79b8914f91b1a010380138e36a9fb01922481a25`
- Pull request: [#7 — health-aware routing and bounded failover](https://github.com/HeavenzFire/Sovereign-Node-/pull/7)

The recovery branch is a same-provider checkpoint, not a complete offsite backup. Keep an encrypted local or second-provider copy for provider/account outage resilience.

## What is included

- `src/lib/unified-field-routing.ts`: transport-agnostic, health-aware worker selection and bounded failover planning.
- `tests/unified-field-routing.test.ts`: deterministic routing and failure-case tests.
- `package.json`: the `npm test` script includes both routing and task-contract tests.

The current mesh endpoint in `server.ts` returns fixtures marked `mode: "simulation"` and `live_discovery: false`. Do not report these fixtures as live nodes.

## Resume procedure

Use Node.js/npm and a clean working tree. From PowerShell:

```powershell
git clone https://github.com/HeavenzFire/Sovereign-Node-.git
Set-Location .\Sovereign-Node-
git fetch origin
git switch --track origin/feat/unified-field-resilient-routing
npm ci
npm test
npm run lint
npm run build
```

If the feature branch is unavailable, recover the checkpoint:

```powershell
git fetch origin backup/unified-field-routing-2026-10-21
git switch --detach origin/backup/unified-field-routing-2026-10-21
```

A detached checkout is for inspection/recovery. Create a new branch before making commits.

## Create an offline recovery copy

Run this on a trusted machine with Git installed. Store the output on a separate encrypted drive or other independent storage. Ensure the destination has sufficient space.

```powershell
$repo = "https://github.com/HeavenzFire/Sovereign-Node-.git"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $PWD "HeavenzFire-Sovereign-Node-$stamp.bundle"
git clone --mirror $repo ".\HeavenzFire-Sovereign-Node.git"
if ($LASTEXITCODE -ne 0) { throw "Mirror clone failed; do not treat backup as complete." }
git -C ".\HeavenzFire-Sovereign-Node.git" bundle create $backup --all
if ($LASTEXITCODE -ne 0) { throw "Bundle creation failed." }
git bundle verify $backup
if ($LASTEXITCODE -ne 0) { throw "Bundle verification failed." }
Get-FileHash $backup -Algorithm SHA256
```

Keep the printed SHA-256 value alongside the backup on the separate storage device. Periodically test recovery by cloning from the bundle into a new directory and running the test suite. A Git bundle preserves Git history and refs; it does not necessarily preserve external releases, issues, pull-request discussions, secrets, or external service state.

## Backup policy

1. Keep changes in small, reviewable commits and push them to GitHub.
2. Create a checkpoint branch before risky refactors or migration work.
3. Maintain at least one backup outside the primary GitHub account/provider.
4. Keep credentials, API keys, tokens, private user data, and local environment files out of Git and backups unless specifically required and securely handled.
5. Test restores periodically; an untested backup is not a verified recovery.
6. Preserve approval gates for destructive operations, privilege changes, network exposure, and secret handling. Recovery must not silently disable security controls.
7. Record test results accurately. A committed test is not proof that it passed; only report success after running it and inspecting the result.

## Next engineering steps

1. Run `npm ci`, `npm test`, `npm run lint`, and `npm run build` in a clean checkout.
2. Resolve any failures before merging pull request #7.
3. Add real node registration and heartbeat handling separately from simulation fixtures.
4. Add integration tests that disconnect a worker, confirm timeout detection, and verify bounded reassignment without duplicate side effects. Use idempotency keys and durable task state before claiming crash-safe execution.
5. Document an operator-controlled restore and rollback drill.
