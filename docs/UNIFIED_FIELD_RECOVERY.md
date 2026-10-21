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

## Current implementation status

- `src/lib/unified-field-registry.ts` implements process-local registration, declared-capability validation, server-generated heartbeat timestamps, TTL-based healthy/offline snapshots, and explicit removal.
- `server.ts` exposes `POST /api/mesh/register`, `POST /api/mesh/heartbeat`, `GET /api/mesh/live-nodes`, and `DELETE /api/mesh/live-nodes/:id`.
- The process still binds to `127.0.0.1`. The registry is not persistent across restarts and is not remote mesh discovery. The existing `/api/mesh/nodes` route remains simulation fixtures.
- GitHub Actions Unified Field verification run #12 passed the locked install, contract-test step, type-check, and production build on commit `2c26e528f6a8e8356781d0e1634161b2343586d5`. Subsequent capability-validation changes must pass their own latest run before they are treated as verified.
- The connected Windows machine could not clone this repository over HTTPS because GitHub authentication failed; this prevented a separate local test run.

## Next engineering steps

1. Confirm the latest GitHub Actions run passes after capability allowlisting and test corrections.
2. Add HTTP integration tests for registration, heartbeat, invalid input, TTL expiry, and removal.
3. Add authentication and authorization before any non-loopback listener or cross-machine registration is considered.
4. Add durable task state and idempotency enforcement, then test worker loss and bounded reassignment without duplicate side effects.
5. Persist registry state only with an explicit recovery/versioning policy, then run operator-controlled restart and restore drills.
