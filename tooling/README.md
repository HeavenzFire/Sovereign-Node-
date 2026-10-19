# HeavenzFire Custom Toolchain

This directory is the starting point for a local-first HeavenzFire tool system. The goal is to own the orchestration, permissions, diagnostics, audit trail, and recovery logic while treating external AI/browser providers as replaceable adapters.

## Design rules

- **Local-first:** local PowerShell, filesystem, process, HTTP, Ollama, and project tools work without a cloud agent.
- **Provider-optional:** Gemini, OpenAI, browser automation providers, and extensions are adapters—not the control plane.
- **Allowlist by default:** tools declare exact operations and parameter schemas. No arbitrary shell execution from model output.
- **Approval gates:** destructive filesystem actions, administrator changes, network changes, credentials, publishing, and remote execution require explicit approval.
- **Evidence-backed status:** every result records the requested operation, timestamp, exit/status code, and sanitized summary. A tool is not marked successful without observed output.
- **Bounded recovery:** retries use capped exponential backoff with jitter; 429/quota errors trigger cooldown and route selection, not retry storms.
- **Resource-aware:** check disk and memory headroom before launching heavy jobs. Avoid model downloads/builds when the machine is critically low on space.
- **Portable interfaces:** each tool exposes a versioned JSON input/output contract so PowerShell, TypeScript, browser extension, and future Rust services can share it.

## Initial implementation

`Invoke-HeavenzFireDiagnostics.ps1` is a read-only PowerShell 5.1-compatible probe for local HeavenzFire/Ollama HTTP services. It makes bounded HTTP requests and reports observed status; it does not restart services, change configuration, or delete data.

## Planned tool families

1. **Core host:** tool registry, schema validation, permissions, audit log, cancellation, timeout and resource budget.
2. **Windows host:** PowerShell 5.1-safe process, disk, memory, service, event-log and filesystem diagnostics.
3. **Local AI:** Ollama discovery, model inventory, health probes, bounded routing and quota-aware cloud adapters.
4. **Browser:** our own extension with explicit per-site permissions, DOM inspection, navigation/actions behind approval, and local messaging to the host.
5. **Workspace:** Git status/diff, tests, backups, file search and safe patch application.
6. **Network/security:** DNS/TLS/HTTP inspection, port inventory, dependency and secret scanning; only authorized targets.
7. **Scheduler/recovery:** Auto-Pilot off by default, durable job state, idempotent tasks and crash-safe resume.
8. **Interface:** local API plus a small dashboard; optional connectors implement the same contracts.

## Acceptance criteria

- A clean install can run diagnostics with cloud access disabled.
- Unit tests cover timeouts, refused connections, 429 handling, malformed output and cancellation.
- No tool can perform arbitrary destructive actions solely because an LLM requested them.
- Provider failures do not erase jobs, logs, or workspace state.
- Every claim of “healthy”, “connected”, or “recovered” links to a timestamped observed result.

This is a foundation, not a claim that all tool families are implemented yet.
