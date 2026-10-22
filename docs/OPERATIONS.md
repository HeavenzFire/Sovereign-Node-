# Unified Field Node: Operations and Verification

This document describes the currently implemented service contract in `server.ts`. It distinguishes local process health from distributed-system claims.

## Start locally

Requirements: Node.js and npm.

```powershell
npm install
npm run dev
```

The server uses `PORT` when set and otherwise listens on port `3000`. Set `HEAVENZFIRE_NODE_ID` to label this process. The current registry heartbeat TTL is controlled by `HEAVENZFIRE_HEARTBEAT_TTL_MS` (default: 15000 ms).

## Verify the process

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
Invoke-RestMethod http://127.0.0.1:3000/api/capabilities
Invoke-RestMethod http://127.0.0.1:3000/api/mesh/live-nodes
```

- `/health` and `/api/health` report this process's health, node ID, version, uptime, capabilities, and observation timestamp.
- `/api/capabilities` returns the declared capability contract.
- `/api/mesh/live-nodes` currently exposes a process-local registry. Its response explicitly reports `live_discovery: false`; it is not proof of cross-machine discovery or remote reachability.

A successful health response is not evidence that every dependency, worker, or remote node is healthy.

## Validate a task without executing it

```powershell
$body = @{
  task_id = "validation-example-001"
  capability = "task.run"
  deadline = (Get-Date).ToUniversalTime().AddMinutes(2).ToString("o")
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/api/tasks/validate -ContentType "application/json" -Body $body
```

Use the exact task-envelope fields and capability names defined in `src/lib/unified-field-contract.ts`. The validation endpoint classifies a request and reports whether approval is required; it returns `execution: "not_started"` and does not execute the task.

## Current API surface

| Route | Purpose | Operational caveat |
|---|---|---|
| `GET /health`, `GET /api/health` | Local process health | Not a mesh-wide health check |
| `GET /api/capabilities` | Declared capabilities | Describes the contract, not dependency availability |
| `POST /api/tasks/validate` | Validate and classify a task envelope | Does not execute the task |
| `POST /seal` | Seal supplied data | Treat as potentially durable or externally significant; apply an explicit approval step in callers |
| `GET /api/vault` | Inspect latest seal and recent history | Review data sensitivity before exposing this route beyond loopback |
| `POST /api/trinary/decide` | Request a trinary decision | Validate caller input and handle server errors |
| `GET /api/mesh/live-nodes` | List this process's registry entries | Local registry only; not remote discovery |

Consult `server.ts` for the complete current implementation before depending on additional routes.

## Worker-routing invariants

The routing implementation and tests should preserve these rules:

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

These are the repository's declared scripts. Record actual exit codes and output when reporting verification; a command being documented or started is not a passing test.

## Security and deployment boundary

The server source describes the current HTTP listener as loopback-bound until a separately secured remote transport is implemented. Do not expose this service directly to a public interface. Before enabling remote access, implement and test authentication, authorization per capability, transport security, replay protection where applicable, rate limits, audit logging, and explicit approval for consequential actions.

Keep API keys in environment configuration or a secret manager; never commit secrets to the repository.
