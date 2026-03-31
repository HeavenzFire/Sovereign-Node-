// Pure type definitions — no runtime overhead
export type TrinaryDecision = "ALLOW" | "BLOCK" | "ESCALATE";

export interface ProposedAction {
  id: string;                    // UUID v4
  kind: "file_edit" | "deploy" | "message_send" | "fpga_program" | "mesh_broadcast" | "ledger_commit";
  payload: Record<string, any>;  // Domain-specific action data
  actor: "hud" | "cli" | "agent-qwen" | "agent-llama" | "mesh-node";
  context?: {
    session_id?: string;
    sigma?: number;              // Resonance level (default: 2.0)
    entropy_hint?: number;       // Pre-computed ΔS estimate
    tags?: string[];
  };
}

export interface TrinaryResult {
  action: ProposedAction;
  decision: TrinaryDecision;
  riskScore: number;             // 0.0 (safe) → 1.0 (critical)
  impactScope: Array<"local" | "mesh" | "external" | "hardware">;
  explanation: string;           // Human-readable rationale
  syntropy_alignment: {
    estimated_deltaS: number;    // -3 → +3 scale
    coherence_gain: boolean;     // Does this increase tribal/system coherence?
  };
  audit: {
    modelsConsulted: string[];   // ["qwen3.5-4b", "llama3-8b"]
    timestamp: string;           // ISO 8601
    zylpha_hash: string;         // SHA3-256 of decision + action
  };
  signature?: string;            // HMAC-SHA3-256 (session key) — optional
}
