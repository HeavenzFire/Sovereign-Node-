/**
 * Unified Field resilient routing primitives.
 *
 * This module is deliberately transport-agnostic: callers provide observed node
 * state and explicit exclusions. It does not claim that simulated nodes are live.
 */
export type WorkerNode = {
  id: string;
  status: "healthy" | "degraded" | "offline";
  capabilities: readonly string[];
  activeTasks: number;
  maxTasks: number;
  lastHeartbeatMs: number;
};

export type RouteDecision =
  | { ok: true; nodeId: string; reason: "least-loaded-healthy-compatible" }
  | { ok: false; reason: "no-eligible-node"; excluded: string[] };

export function selectWorker(
  nodes: readonly WorkerNode[],
  requiredCapabilities: readonly string[],
  excludedIds: readonly string[] = [],
  nowMs: number = Date.now(),
  heartbeatTtlMs: number = 15_000
): RouteDecision {
  const excluded = new Set(excludedIds);
  const eligible = nodes.filter((node) =>
    node.id.trim().length > 0 &&
    !excluded.has(node.id) &&
    node.status === "healthy" &&
    Number.isFinite(node.activeTasks) &&
    Number.isFinite(node.maxTasks) &&
    node.activeTasks >= 0 &&
    node.maxTasks > 0 &&
    node.activeTasks < node.maxTasks &&
    Number.isFinite(node.lastHeartbeatMs) &&
    nowMs - node.lastHeartbeatMs >= 0 &&
    nowMs - node.lastHeartbeatMs <= heartbeatTtlMs &&
    requiredCapabilities.every((capability) => node.capabilities.includes(capability))
  );

  eligible.sort((a, b) => {
    const loadA = a.activeTasks / a.maxTasks;
    const loadB = b.activeTasks / b.maxTasks;
    return loadA - loadB || a.id.localeCompare(b.id);
  });

  if (eligible.length === 0) {
    return { ok: false, reason: "no-eligible-node", excluded: [...excluded].sort() };
  }
  return {
    ok: true,
    nodeId: eligible[0].id,
    reason: "least-loaded-healthy-compatible"
  };
}

/**
 * Retry planning is explicit and bounded. The caller must record the failed
 * node and pass it as excludedIds before selecting a replacement.
 */
export function planFailover(
  nodes: readonly WorkerNode[],
  requiredCapabilities: readonly string[],
  attemptedNodeIds: readonly string[],
  maxAttempts: number,
  nowMs: number = Date.now(),
  heartbeatTtlMs: number = 15_000
): RouteDecision {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    return { ok: false, reason: "no-eligible-node", excluded: [...new Set(attemptedNodeIds)].sort() };
  }
  if (new Set(attemptedNodeIds).size >= maxAttempts) {
    return { ok: false, reason: "no-eligible-node", excluded: [...new Set(attemptedNodeIds)].sort() };
  }
  return selectWorker(nodes, requiredCapabilities, attemptedNodeIds, nowMs, heartbeatTtlMs);
}
