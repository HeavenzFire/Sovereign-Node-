# Unified Field Node: Operations and Verification

This document describes the implemented service contract in `server.ts`. It distinguishes local process health from distributed-system claims.

## Start locally

Requirements: Node.js and npm.

```powershell
npm install
npm run dev
```

The server uses `PORT` when set and otherwise listens on port `3000`. Set `HEAVENZFIRE_NODE_ID` to label this process. The registry heartbeat TTL is controlled by `HEAVENZFIRE_HEARTBEAT_TTL_MS` (default: 15000 ms).

## Verify the process

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
Invoke-RestMethod http://127.0.0.1:3000/api/capabilities
Invoke-RestMethod http://127.0.0.1:3000/api/mesh/live-nodes
```

- `/health` and `/api/health` report this process's health, node ID, version, uptime, capabilities, and observation timestamp.
- `/api/capabilities` returns the declared capability contract.
- `/api/mesh/live-nodes` exposes a process-local registry. Its response reports `live_discovery: false`; it is not proof of cross-machine discovery or remote reachability.

A successful health response is not evidence that every dependency, worker, or remote node is healthy.

## Approval credential for consequential operations

The `POST /seal`, `POST /api/trinary/decide`, and WebSocket `START_ENGINE` paths fail closed unless a configured approval credential is supplied. Configure a fresh 32-byte random token in the same PowerShell session used to start the server:

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$env:HEAVENZFIRE_APPROVAL_TOKEN = [Convert]::ToBase64String($bytes)
npm run dev
```

For the two HTTP routes, pass the token in the `x-heavenzfire-approval` header. For WebSocket `START_ENGINE`, include it as the `approval_token` property in the message. Do not print it, commit it, put it in a URL, or include it in logs. If the environment variable is absent or shorter than 32 characters, the consequential operations are denied.

This is a shared bearer credential and a fail-closed authorization gate; it is **not** a trusted human-approval interface or per-task approval ledger. Keep the service loopback-only and treat possession of this token as permission to invoke these operations. A production deployment still needs an authenticated approval workflow, audit trail, and stronger identity/authorization controls.

## Validate a task without executing it

```powershell
$body = @{
  task_id = "validation-example-001"
  capability = "health.read"
  idempotency_key = "validation-example-001-v1"
  deadline = (Get-Date).ToUniversalTime().AddMinutes(2).ToString("o")
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/api/tasks/validate -ContentType "application/json" -Body $body
```

Use capability names defined in `src/lib/unified-field-contract.ts`. The task envelope requires `task_id`, a known `capability`, `idempotency_key`, and a future ISO-parseable `deadline`. Validation classifies the request and reports whether approval is required; it returns `execution: "not_started"` and does not execute the task.

## Current API surface

| Route | Purpose | Operational caveat |
|---|---|---|
| `GET /health`, `GET /api/health` | Local process health | Not a mesh-wide health check |
| `GET /api/capabilities` | Declared capabilities | Describes the contract, not dependency availability |
| `POST /api/tasks/validate` | Validate and classify a task envelope | Does not execute the task |
| `POST /seal` | Seal supplied data | Capability requires approval; callers must enforce approval before invoking consequential operations |
| `GET /api/vault` | Inspect latest seal and recent history | Review data sensitivity before exposing this route beyond loopback |
| `POST /api/trinary/decide` | Request a trinary decision | Validate caller input and handle server errors |
| `GET /api/mesh/live-nodes` | List this process's registry entries | Local registry only; not remote discovery |

Consult `server.ts` for the complete current implementation before depending on additional routes.

## Worker-routing invariants

Preserve these rules in routing implementations and tests:

1. Only healthy/online workers with the requested capability and a fresh heartbeat are eligible.
2. Exclude offline, stale, saturated, previously failed, or capability-mismatched workers.
3. Prefer the least-loaded eligible worker and use deterministic tie-breaking.
4. Bound retry/failover attempts. Retry only eligible failures for idempotent tasks.
5. Never bypass a required approval gate.
6. Report the reason for a selection or a no-eligible-worker result; do not label an unobserved worker as live.

## Run the automated checks

```powershell
npm test
npm run lint
npm run test:capabilities
```

These are the repository's declared scripts. Record actual exit codes and output when reporting verification; documenting or starting a command is not a passing test.

## Security and deployment boundary

The server source describes the current HTTP listener as loopback-bound until a separately secured remote transport is implemented. Do not expose this service directly to a public interface. Before enabling remote access, implement and test authentication, authorization per capability, transport security, replay protection where applicable, rate limits, audit logging, and explicit approval for consequential actions.

Keep API keys in environment configuration or a secret manager; never commit secrets to the repository.
