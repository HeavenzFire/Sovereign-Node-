/**
 * Trinary Decision Schema
 * Core object for the Sovereign Control Plane.
 */

export type TrinaryDecision = "ALLOW" | "BLOCK" | "ESCALATE";

export interface ProposedAction {
  id: string;
  kind: string;          // "file_edit", "deploy", "message_send", etc.
  payload: any;          // domain-specific data
  actor: string;         // "hud", "cli", "agent-qwen"
  context?: any;         // optional extra info
}

export interface TrinaryResult {
  action: ProposedAction;
  decision: TrinaryDecision;
  riskScore: number;     // 0–1
  impactScope: string[]; // ["local", "mesh", "external"]
  explanation: string;
  audit: {
    modelsConsulted: string[];
    timestamp: string;
  };
}
