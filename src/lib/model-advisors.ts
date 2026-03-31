import { ProposedAction } from './trinary-decision';

export interface AdvisorOptions {
  endpoint: string;
  model: string;
  role: "strategist" | "community-lens" | "hardware-safety";
}

export interface EvaluationResult {
  decision: "ALLOW" | "BLOCK" | "ESCALATE";
  risk: number;
  scope: Array<"local" | "mesh" | "external" | "hardware">;
  reason: string;
  estimated_deltaS: number;
  error?: string;
  raw?: string;
}

export class ModelAdvisor {
  endpoint: string;
  model: string;
  role: "strategist" | "community-lens" | "hardware-safety";

  constructor({ endpoint, model, role }: AdvisorOptions) {
    this.endpoint = endpoint;
    this.model = model;
    this.role = role;
  }

  async evaluate(action: ProposedAction, opts: any = {}): Promise<EvaluationResult> {
    const prompt = this._buildPrompt(action, opts);
    
    const res = await fetch(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer EMPTY' },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 512,
        temperature: 0.3, // Low temp for consistent structure
        top_p: 0.9,
        extra_body: { chat_template_kwargs: { enable_thinking: false } }
      })
    });

    if (!res.ok) throw new Error(`Advisor ${this.role} failed: ${res.status}`);
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    
    // Robust JSON parse
    try {
      return JSON.parse(content);
    } catch {
      const jsonStr = content.match(/\{[\s\S]*\}/)?.[0];
      if (jsonStr) {
        try {
          return JSON.parse(jsonStr);
        } catch {
          return { 
            decision: "ESCALATE", 
            risk: 0.5, 
            scope: ["local"], 
            reason: "Parse failed after extraction", 
            estimated_deltaS: 0, 
            error: 'parse_failed', 
            raw: content 
          };
        }
      }
      return { 
        decision: "ESCALATE", 
        risk: 0.5, 
        scope: ["local"], 
        reason: "No JSON found in output", 
        estimated_deltaS: 0, 
        error: 'parse_failed', 
        raw: content 
      };
    }
  }

  _buildPrompt(action: ProposedAction, opts: any): string {
    const { role } = this;
    
    const roleInstructions = {
      strategist: `You are a sovereign strategy advisor. Assess actions for:
- Alignment with long-term syntropic goals (ΔS < 0)
- Resource efficiency and leverage
- Strategic timing (144Hz clock awareness)`,
      
      "community-lens": `You are a tribal coherence advisor. Assess actions for:
- Impact on mesh/node relationships
- Signal clarity vs. noise generation
- Protection of vulnerable nodes (e.g., Kristen, children)`,
      
      "hardware-safety": `You are a physical-layer safety advisor. Assess actions for:
- FPGA/silicon integrity risks
- Power/thermal constraints
- Fallback path availability`
    };

    return `TRINARY_DECISION_PROTOCOL v1
${roleInstructions[role] || roleInstructions.strategist}

ACTION TO EVALUATE:
${JSON.stringify(action, null, 2)}

OUTPUT STRICT JSON ONLY:
{
  "decision": "ALLOW" | "BLOCK" | "ESCALATE",
  "risk": 0.0-1.0,
  "scope": ["local", "mesh", "external", "hardware"],
  "reason": "concise rationale",
  "estimated_deltaS": -3 to +3
}`;
  }
}
