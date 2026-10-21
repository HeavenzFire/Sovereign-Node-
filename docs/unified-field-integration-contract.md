# Unified Field Integration Contract

Status: baseline inventory; integration not yet verified end-to-end
Owner: HeavenzFire
Last reviewed: 2026-10-20

## Purpose

Define a small, testable integration boundary between the Sovereign Node service and other Unified Field components. This document is an engineering contract, not a claim that separate agents are connected or that simulated nodes are real infrastructure.

## Observed service surface

Source inspected: `server.ts` on `main`.

| Surface | Current behavior observed | Integration status |
|---|---|---|
| `GET /api/health` | Returns `{ "status": "ok" }` | Minimal liveness only |
| `POST /seal` | Accepts `body.data`; returns a signature/status/compression object | Contract and input limits need tests |
| `GET /api/vault` | Returns latest seal, count, compression, and last ten history entries | Data sensitivity/access policy unverified |
| `POST /api/trinary/decide` | Passes request body to `TrinaryDecider.decide` | Input schema and failure contract need tests |
| `GET /api/mesh/nodes` | Returns four hard-coded node records | Simulation only; not live discovery |
| WebSocket | Accepts `START_ENGINE` and `STOP_ENGINE`; emits metrics/reasoning | Message validation and lifecycle need tests |

## Integration rules

1. Components must exchange versioned JSON contracts. Every message includes `schema_version` and a stable `request_id` where applicable.
2. A capability is discoverable only when its manifest validates and its health probe succeeds. Static configuration is not proof of runtime availability.
3. Node records must declare `source: "simulated" | "observed"`; simulated records must never be presented as live infrastructure.
4. Network exposure is deny-by-default. Before deployment, replace the current `0.0.0.0` listener with an explicit configurable bind address; default to loopback for local development. Do not expose unauthenticated mutation endpoints to an untrusted network.
5. Validate request bodies and WebSocket frames; reject malformed JSON and unknown message types without crashing the process.
6. Keep secrets and sensitive payloads out of logs. Any claim of no logging must be checked against actual code and runtime behavior.
7. Integrations must be independently testable and fail closed when required capabilities are absent.

## Minimum acceptance criteria

- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [ ] Health endpoint test confirms response shape and status code.
- [ ] Seal endpoint tests cover missing data, valid input, oversized input, and malformed JSON.
- [ ] Trinary endpoint tests cover invalid payload and handled internal error.
- [ ] Mesh endpoint labels current hard-coded nodes as simulated, or replaces them with a verified discovery source.
- [ ] WebSocket tests cover malformed JSON, unknown message type, start/stop, and disconnect cleanup.
- [ ] A security review confirms the bind address, access controls, payload limits, and vault data policy.
- [ ] Integration tests verify each external component against this contract; screenshots or repository names alone do not count as proof.

## Parallel worker handoff

A separate worker may take the WebSocket validation/test task. Another may implement and test a versioned capability manifest. Workers should open separate branches and PRs, report exact commits and test output, and avoid editing the same files concurrently. This repository issue/contract is the shared handoff channel; it does not imply direct chat-to-chat communication.

## Rollback

This contract is additive documentation. Revert its single commit if it conflicts with an agreed project direction; no runtime behavior is changed by this document.
