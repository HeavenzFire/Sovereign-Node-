/**
 * Types for the collapse16 primitive.
 * Part of the AI Action Kernel (16:1 implementation).
 */

export interface RawPrompt {
  id: string;
  timestamp: string;
  source: 'hud' | 'cli' | 'agent';
  raw_prompt: string;
  tags?: string[];
  session_id: string;
}

export interface CanonicalIntent {
  canonical_prompt: string;
  intent_summary: string;
  scope: string[];
  priority: 'low' | 'medium' | 'high';
  glyph: 'ANGELUS_CORE' | 'TOROID_STABLE' | 'PHI_EXPANSION' | 'VOID_ZERO';
  resonance: number; // Hz
  reconstruction_key: {
    source_ids: string[];
    collapse_strategy: string;
    version: string;
    session_hint?: string | null;
  };
}
