/**
 * In-memory live-node registry.
 *
 * Registration and heartbeat timestamps are assigned by this process; clients
 * cannot claim a fresh heartbeat by supplying their own timestamp.
 */
export type RegistryNodeInput = {
  id: string;
  capabilities: readonly string[];
  maxTasks: number;
};

export type RegisteredNode = {
  id: string;
  capabilities: readonly string[];
  activeTasks: number;
  maxTasks: number;
  registeredAtMs: number;
  lastHeartbeatMs: number;
};

export type RegistrySnapshot = RegisteredNode & {
  status: "healthy" | "offline";
  heartbeatAgeMs: number;
};

const NODE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CAPABILITY_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

export class UnifiedFieldRegistry {
  private readonly nodes = new Map<string, RegisteredNode>();

  constructor(
    private readonly heartbeatTtlMs = 15_000,
    private readonly clock: () => number = Date.now
  ) {
    if (!Number.isFinite(heartbeatTtlMs) || heartbeatTtlMs < 1) {
      throw new Error("heartbeatTtlMs must be a positive finite number");
    }
  }

  register(input: RegistryNodeInput): RegisteredNode {
    if (!input || typeof input.id !== "string" || !NODE_ID_PATTERN.test(input.id)) {
      throw new Error("Invalid node id");
    }
    if (!Array.isArray(input.capabilities) ||
        input.capabilities.some((c) => typeof c !== "string" || !CAPABILITY_PATTERN.test(c)) ||
        new Set(input.capabilities).size !== input.capabilities.length) {
      throw new Error("Invalid or duplicate node capabilities");
    }
    if (!Number.isInteger(input.maxTasks) || input.maxTasks < 1 || input.maxTasks > 10_000) {
      throw new Error("maxTasks must be an integer between 1 and 10000");
    }

    const now = this.clock();
    if (!Number.isFinite(now)) throw new Error("Clock returned an invalid timestamp");
    const previous = this.nodes.get(input.id);
    const node: RegisteredNode = {
      id: input.id,
      capabilities: [...input.capabilities],
      activeTasks: previous?.activeTasks ?? 0,
      maxTasks: input.maxTasks,
      registeredAtMs: previous?.registeredAtMs ?? now,
      lastHeartbeatMs: now
    };
    this.nodes.set(node.id, node);
    return { ...node, capabilities: [...node.capabilities] };
  }

  heartbeat(id: string): RegisteredNode | null {
    const node = this.nodes.get(id);
    if (!node) return null;
    const now = this.clock();
    if (!Number.isFinite(now) || now < node.lastHeartbeatMs) {
      throw new Error("Clock moved backwards or returned an invalid timestamp");
    }
    node.lastHeartbeatMs = now;
    return { ...node, capabilities: [...node.capabilities] };
  }

  list(): RegistrySnapshot[] {
    const now = this.clock();
    return [...this.nodes.values()]
      .map((node) => {
        const heartbeatAgeMs = Math.max(0, now - node.lastHeartbeatMs);
        return {
          ...node,
          capabilities: [...node.capabilities],
          heartbeatAgeMs,
          status: heartbeatAgeMs <= this.heartbeatTtlMs ? "healthy" as const : "offline" as const
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  remove(id: string): boolean {
    return this.nodes.delete(id);
  }
}
