'use strict';

// Low-power, local-first route selection. This chooses among already-configured
// transports; it does not create listeners, hide traffic, or bypass network policy.

const DEFAULT_POLICY = Object.freeze({
  allowExternal: false,
  requireAuthenticated: true,
  maxEstimatedMilliwatts: 500,
  powerWeight: 1,
  latencyWeight: 0.25,
  localPreference: 100
});

function selectRoute({ routes, policy = {} }) {
  if (!Array.isArray(routes)) throw new TypeError('routes must be an array');
  const rules = { ...DEFAULT_POLICY, ...policy };
  const rejected = [];
  const candidates = [];

  for (const route of routes) {
    let reason = null;
    if (!route || typeof route.id !== 'string' || !route.id) reason = 'invalid-route';
    else if (route.available !== true) reason = 'unavailable';
    else if (rules.requireAuthenticated && route.authenticated !== true) reason = 'authentication-required';
    else if (route.local !== true && rules.allowExternal !== true) reason = 'external-route-disabled';
    else if (!Number.isFinite(route.estimatedMilliwatts) || route.estimatedMilliwatts < 0) reason = 'invalid-power-estimate';
    else if (route.estimatedMilliwatts > rules.maxEstimatedMilliwatts) reason = 'power-budget-exceeded';
    else if (!Number.isFinite(route.latencyMs) || route.latencyMs < 0) reason = 'invalid-latency';

    if (reason) {
      rejected.push({ id: route && route.id || null, reason });
      continue;
    }

    const score =
      route.estimatedMilliwatts * rules.powerWeight +
      route.latencyMs * rules.latencyWeight -
      (route.local ? rules.localPreference : 0);
    candidates.push({ route, score });
  }

  candidates.sort((a, b) => a.score - b.score || a.route.id.localeCompare(b.route.id));
  if (!candidates.length) {
    return { status: 'no-eligible-route', selected: null, rejected };
  }

  const chosen = candidates[0].route;
  return {
    status: 'selected',
    selected: {
      id: chosen.id,
      transport: chosen.transport,
      local: chosen.local,
      estimatedMilliwatts: chosen.estimatedMilliwatts,
      latencyMs: chosen.latencyMs
    },
    rejected
  };
}

// Quiet mode means fewer routine wakeups, not covert or undetectable traffic.
// Callers still need to enforce deadlines and send immediate safety-critical events.
function heartbeatIntervalMs({ quiet = true, nodeState = 'idle', minMs = 5_000, maxMs = 300_000 } = {}) {
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || minMs < 1 || maxMs < minMs) {
    throw new RangeError('heartbeat interval bounds are invalid');
  }
  if (nodeState === 'offline') return maxMs;
  if (nodeState === 'busy') return minMs;
  return quiet ? maxMs : Math.min(maxMs, Math.max(minMs, 30_000));
}

module.exports = { selectRoute, heartbeatIntervalMs, DEFAULT_POLICY };
