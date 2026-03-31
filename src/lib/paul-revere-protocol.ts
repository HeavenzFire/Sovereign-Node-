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
   * Now calls the server-side decider for authoritative, signed results.
   */
  async trinaryDecide(action: ProposedAction): Promise<TrinaryResult> {
    try {
      const response = await fetch('/api/trinary/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action)
      });
      
      if (!response.ok) throw new Error(`Server responded with ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error("Trinary decision API failed, falling back to local emergency block:", error);
      // Emergency fallback if API is unreachable
      return {
        action,
        decision: 'BLOCK',
        riskScore: 1.0,
        impactScope: ['local'],
        explanation: `Emergency block: API unreachable. ${error instanceof Error ? error.message : String(error)}`,
        syntropy_alignment: { estimated_deltaS: 0, coherence_gain: false },
        audit: {
          modelsConsulted: [],
          timestamp: new Date().toISOString(),
          zylpha_hash: 'EMERGENCY_BLOCK'
        }
      };
    }
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
   * Tightened ZYLPHA_PROOF logic for topological state analysis.
   * Derives a glyph from a 16-point vector (resonance check).
   */
  private deriveGlyphFromVector(vec: number[]): { glyph: 'ANGELUS_CORE' | 'TOROID_STABLE' | 'PHI_EXPANSION' | 'VOID_ZERO', resonance: number } {
    const sum = vec.reduce((a, b) => a + b, 0);
    const mod369 = sum % 369;

    // Pattern A: Perfect Modulo Resonance (The "Anchor")
    if (mod369 === 0 && sum > 0) return { glyph: "ANGELUS_CORE", resonance: 369 }; 

    // Pattern B: Toroidal Flow (Standard deviation check for 'smoothness')
    const mean = sum / vec.length;
    const variance = vec.reduce((a, b) => a + (b - mean) ** 2, 0) / vec.length;
    
    if (variance < 0.09) return { glyph: "TOROID_STABLE", resonance: 144 }; // High coherence
    if (sum > 144) return { glyph: "PHI_EXPANSION", resonance: 369 };      // Growth state
    
    return { glyph: "VOID_ZERO", resonance: 0 }; // Entropy/Reset state
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

    // Generate a vector from the prompts for topological analysis
    // In a real system, this might be an embedding or a specific metric
    const vector = prompts.map(p => p.raw_prompt.length % 369);
    const { glyph, resonance } = this.deriveGlyphFromVector(vector);

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
      source_count: 16,
      topological_glyph: glyph
    });

    return {
      canonical_prompt: result.canonical_prompt || "Failed to synthesize intent.",
      intent_summary: result.intent_summary || "No summary available.",
      scope: dominantTags,
      priority: "medium",
      glyph,
      resonance,
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
      intent_summary: "Local heuristic summary generated.",
      glyph: isSyntropic ? "ANGELUS_CORE" : "TOROID_STABLE",
      resonance_hz: isSyntropic ? 369 : 144
    };
  }
}

export const prp = new PaulRevereProtocol();
