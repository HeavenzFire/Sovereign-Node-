# Sovereign Node HTTP/WebSocket Security Review

Review date: 2026-10-20
Scope: static review of `server.ts`, `src/lib/zylpha-kernel.ts`, and `src/lib/trinary-decide.ts` on `main`.
Review type: source inspection only; no live service or penetration test was run.

## Current protections observed

- Express JSON bodies are limited to 256 KiB.
- HTTP listener binds to `127.0.0.1`, not all interfaces.
- Malformed WebSocket JSON is caught and returned as an error.
- Unknown WebSocket message types receive an error.
- The mesh endpoint explicitly identifies its fixture data as simulation and reports `live_discovery: false`.
- The server exposes health and capability metadata endpoints.

## Findings

### High — capability approval metadata is not enforcement

The capability registry labels `seal.create`, `trinary.decide`, and `engine.stream` as requiring approval, but the inspected routes do not verify an approval token or authenticated principal. Metadata alone cannot enforce approval. Because the server currently binds to loopback, this is primarily a local-process boundary concern; any future network exposure would raise severity.

**Required action:** implement an explicit local approval/authentication boundary or keep the routes inaccessible to untrusted callers. Add negative tests proving a request without approval cannot invoke a mutating or resource-consuming capability.

### High — WebSocket frame size and shared engine lifecycle

The `WebSocketServer` is created without an explicit `maxPayload` setting. The library default is not a project-specific resource budget. Also, the engine instance is shared by all connected clients, while any client's `STOP_ENGINE` message or socket close calls `engine.stop()`. One client can therefore stop a stream another client initiated.

**Required action:** set a deliberately small documented `maxPayload`; validate message shape and type; define engine ownership (per-client instance or explicit single-owner lease); test two-client start/stop/disconnect scenarios.

### Medium — trinary request validation and failure semantics

The route forwards arbitrary parsed JSON to `TrinaryDecider.decide`. The decider immediately reads `action.kind`; malformed objects can throw and become generic 500 responses. Advisor failures are handled internally, but caller-side schema validation and predictable 400 errors are absent at the route boundary.

**Required action:** define a runtime schema for `ProposedAction`; reject missing or invalid fields with 400; bound string and collection sizes; test advisor-unavailable behavior.

### Medium — vault endpoint exposes process-held seal history

`GET /api/vault` returns recent hashes and metadata to any process able to reach the listener. Hashes are not automatically secrets, but payload sensitivity and intended readers are not defined, and the in-memory vault is not a durable database.

**Required action:** document the threat model and retention policy; return only the minimum data required by the UI; gate access if seals or timing metadata are sensitive.

### Medium — JSON parser errors need a stable API contract

The body-size limit is present, but malformed JSON and oversized bodies rely on Express parser error handling. Confirm the API consistently returns bounded JSON errors rather than a development HTML stack or an unhandled error.

**Required action:** add centralized parser-error handling and tests for malformed JSON and 413 responses.

### Low — health status is liveness, not readiness

Health returns process metadata and configured capabilities. It does not prove the advisor models are reachable, the engine is running, or remote nodes are discovered.

**Required action:** preserve the distinction between liveness and readiness; expose dependency health separately if orchestration needs it.

## Acceptance tests before release

- [ ] `npm run lint` and `npm run build` pass.
- [ ] `POST /seal` rejects missing, malformed, and oversized payloads with stable status codes.
- [ ] `POST /api/trinary/decide` rejects invalid action shapes with 400 and handles unavailable advisors predictably.
- [ ] WebSocket rejects malformed JSON, unknown types, and over-limit frames.
- [ ] Two-client WebSocket tests prove one client's disconnect/stop cannot unexpectedly terminate another client's stream.
- [ ] Approval enforcement is tested at the route boundary, not inferred from manifest metadata.
- [ ] Vault data exposure and retention are explicitly approved.
- [ ] Any deployment beyond loopback has authentication, access controls, and a documented network threat model.

## Limits

This is a static review, not a runtime verification. It does not establish that the application builds, that tests pass, or that any remote mesh node is live. Findings should be closed with code changes and repeatable test evidence.
