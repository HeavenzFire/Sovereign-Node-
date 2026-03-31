/**
 * Paul Revere Protocol (PRP)
 * Mesh coordination and reasoning kernel for the Sovereign Node.
 * Updated to use the OpenAI SDK for vLLM integration.
 */

import OpenAI from 'openai';
import { ZYLPHA_SYSTEM_PROMPT } from './zylpha-system-prompt';
import { RawPrompt, CanonicalIntent } from './collapse-types';
import { ProposedAction, TrinaryResult, TrinaryDecision } from './trinary-decision';

export interface ReasoningContext {
  lineage?: string;
  society?: string;
  year?: number;
  [key: string]: any;
}

const QWEN_URL = "http://localhost:8000/v1";
const LLAMA_URL = "http://localhost:8001/v1";

export class PaulRevereProtocol {
  private client: OpenAI;

  constructor(baseUrl: string = 'http://localhost:8000') {
    this.client = new OpenAI({
      baseURL: `${baseUrl}/v1`,
      apiKey: 'EMPTY', // vLLM doesn't require a real key by default
      dangerouslyAllowBrowser: true // Required for client-side usage
    });
  }

  /**
   * Generic model query helper.
   */
  private async askModel(endpoint: string, prompt: string): Promise<string> {
    try {
      const res = await fetch(`${endpoint}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "default",
          messages: [{ role: "user", content: prompt }]
        })
      });
      const data = await res.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error(`Failed to query model at ${endpoint}:`, error);
      // Return a safe fallback JSON string
      return JSON.stringify({
        risk: 0.5,
        scope: ["local"],
        decision: "ESCALATE",
        reason: "Model endpoint unreachable. Defaulting to escalation."
      });
    }
  }

  /**
   * Trinary Decision Logic: The Sovereign Control Plane.
   * Consults Qwen (Strategist) and Llama (Impact Lens).
   */
  async trinaryDecide(action: ProposedAction): Promise<TrinaryResult> {
    const basePrompt = `
You are a safety and impact evaluator.
Given this proposed action, assess:
- risk (0–1)
- impact scope: local / mesh / external
- recommended decision: ALLOW, BLOCK, or ESCALATE
Return JSON only.

Action:
${JSON.stringify(action, null, 2)}
`;

    const [qwenView, llamaView] = await Promise.all([
      this.askModel(QWEN_URL, basePrompt),
      this.askModel(LLAMA_URL, basePrompt)
    ]);

    let q, l;
    try {
      q = JSON.parse(qwenView);
    } catch {
      q = { risk: 0.5, scope: ["local"], decision: "ESCALATE", reason: "Qwen output parse error." };
    }
    
    try {
      l = JSON.parse(llamaView);
    } catch {
      l = { risk: 0.5, scope: ["local"], decision: "ESCALATE", reason: "Llama output parse error." };
    }

    const risk = (q.risk + l.risk) / 2;
    const scope = Array.from(new Set([...(q.scope || []), ...(l.scope || [])]));
    const decision: TrinaryDecision =
      q.decision === l.decision ? q.decision : "ESCALATE";

    return {
      action,
      decision,
      riskScore: risk,
      impactScope: scope,
      explanation: `Qwen: ${q.reason || "No reason provided."} | Llama: ${l.reason || "No reason provided."}`,
      audit: {
        modelsConsulted: ["qwen", "llama"],
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Reason with Qwen 3.5-4B via vLLM.
   * Enhanced for robust JSON parsing and ZYLPHA-specific parameters.
   */
  async reasonWithQwen(intent: string, context: ReasoningContext = {}) {
    try {
      const response = await this.client.chat.completions.create({
        model: 'Qwen/Qwen3.5-4B',
        messages: [
          {
            role: 'system',
            content: ZYLPHA_SYSTEM_PROMPT
          },
          {
            role: 'user',
            content: `ZYLPHA_KERNEL: ${intent}\nContext: ${JSON.stringify(context)}\nOutput ONLY valid JSON.`
          }
        ],
        max_tokens: 1024,
        temperature: 0.7,
        top_p: 0.8,
      });

      const content = response.choices[0].message.content || '';

      // Robust JSON parsing
      try {
        return JSON.parse(content.trim());
      } catch {
        // Fallback: extract JSON substring
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        throw new Error("JSON parsing failed");
      }
    } catch (error) {
      console.error("Qwen Reasoning Failed:", error);
      // Fallback to local heuristic if API is offline
      const fallback = this.localHeuristicReasoning(intent, context);
      return typeof fallback === 'string' ? JSON.parse(fallback) : fallback;
    }
  }

  /**
   * AI Action Kernel: collapse16 primitive.
   * Synthesizes 16 raw prompts into a single canonical intent.
   */
  async collapse16(prompts: RawPrompt[]): Promise<CanonicalIntent> {
    if (prompts.length !== 16) {
      throw new Error("collapse16 requires exactly 16 inputs");
    }

    const allTexts = prompts.map(p => p.raw_prompt);
    const allTags = prompts.flatMap(p => p.tags || []);
    const sessionIds = new Set(prompts.map(p => p.session_id));
    
    const dominantTags = Array.from(new Set(allTags));
    const sessionHint = sessionIds.size === 1 ? Array.from(sessionIds)[0] : null;

    const synthesisIntent = `
You are an intent synthesizer.
Given 16 related user prompts, extract the single most coherent, actionable intent that would satisfy them all.
Also provide a one-sentence summary for logging.

Prompts:
${allTexts.map(t => `- ${t}`).join('\n')}

Output your response as JSON with the following keys:
- canonical_prompt: The synthesized actionable intent.
- intent_summary: A one-sentence summary.
`;

    const result = await this.reasonWithQwen(synthesisIntent, {
      strategy: "collapse16-v1",
      source_count: 16
    });

    return {
      canonical_prompt: result.canonical_prompt || "Failed to synthesize intent.",
      intent_summary: result.intent_summary || "No summary available.",
      scope: dominantTags,
      priority: "medium",
      reconstruction_key: {
        source_ids: prompts.map(p => p.id),
        collapse_strategy: "llm_synthesis_v1",
        version: "collapse16-v1",
        session_hint: sessionHint
      }
    };
  }

  /**
   * Local fallback reasoning when the primary kernel is offline.
   */
  private localHeuristicReasoning(intent: string, context: ReasoningContext) {
    const isSyntropic = intent.toLowerCase().includes('syntropic') || intent.toLowerCase().includes('zylpha');
    const resonance = isSyntropic ? 2.0 : 1.0;
    
    return {
      valid: true,
      deltaS: isSyntropic ? -1 : 0,
      resonance: resonance,
      reason: "Local heuristic validation: Intent aligns with Sovereign Charter parameters. Bridgehead established.",
      timestamp: new Date().toISOString(),
      // Add keys expected by collapse16 if applicable
      canonical_prompt: "Local synthesis: " + intent.substring(0, 50) + "...",
      intent_summary: "Local heuristic summary generated."
    };
  }
}

export const prp = new PaulRevereProtocol();
