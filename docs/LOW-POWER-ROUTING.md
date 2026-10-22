# Low-Power Private Routing Prototype

Status: design and local prototype implemented; local unit tests passed. This branch documents the current prototype. Hardware power measurements and transport integration are not yet verified.

## Behavior

- Prefer authenticated local routes.
- External routes are disabled by default.
- Reject unavailable routes, unauthenticated peers, invalid latency/power estimates, and routes over the configured power budget.
- Reduce routine idle heartbeats while preserving a short interval for busy nodes.
- Return explicit rejection reasons when no route is eligible.

## Security and quantum-resistance boundary

This is not covert routing and does not make traffic invisible. It does not open listeners, modify firewall settings, or bypass access controls. Power estimates are supplied by the caller, not measured telemetry. The prototype is not quantum-safe cryptography. Post-quantum security requires a maintained implementation of standardized algorithms, negotiated protocol support, and interoperability tests; do not implement a custom cipher.

## Verification

Local Node.js test run: 5 passed, 0 failed. Tests cover local-route preference, external-route opt-in, power limits, fail-closed behavior, and heartbeat bounds.

## Next gates

1. Integrate with the existing Propagation Fabric registry.
2. Replace estimates with measured latency and power telemetry.
3. Add device identity, authentication, and replay protection.
4. Verify a Windows-to-phone path on an authorized private network.
5. Evaluate maintained post-quantum TLS/key-establishment support before making quantum-resistant claims.
