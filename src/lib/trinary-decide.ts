import crypto from 'crypto';
import fs from 'fs';
import { ModelAdvisor } from './model-advisors';
import { ProposedAction, TrinaryResult, TrinaryDecision } from './trinary-decision';

export interface DeciderOptions {
  qwenEndpoint?: string;
  llamaEndpoint?: string;
  sessionKeyPath?: string;
}

export class TrinaryDecider {
  advisors: Record<string, ModelAdvisor>;
  sessionKey: string | null = null;

  constructor({ 
    qwenEndpoint = 'http://localhost:8000/v1',
    llamaEndpoint = 'http://localhost:8001/v1',
    sessionKeyPath = '.keys/session.key'
  }: DeciderOptions = {}) {
    this.advisors = {
      qwen: new ModelAdvisor({ endpoint: qwenEndpoint, model: 'Qwen/Qwen3.5-4B', role: 'strategist' }),
      llama: new ModelAdvisor({ endpoint: llamaEndpoint, model: 'meta-llama/Llama-3-8B', role: 'community-lens' }),
    };
    
    try {
      if (fs.existsSync(sessionKeyPath)) {
        this.sessionKey = fs.readFileSync(sessionKeyPath, 'utf8').trim();
      }
    } catch (err) {
      console.warn('Could not load session key:', err);
    }
  }

  async decide(action: ProposedAction): Promise<TrinaryResult> {
    // 1. Pre-check: hardware actions get hardware advisor
    const advisorsToConsult = ['qwen', 'llama'];
    if (action.kind.includes('fpga') || action.kind.includes('hardware')) {
      advisorsToConsult.push('hardware');
      // Initialize hardware advisor on-demand
      if (!this.advisors.hardware) {
        this.advisors.hardware = new ModelAdvisor({ 
          endpoint: 'http://localhost:8002/v1', 
          model: 'Qwen/Qwen3.5-4B', 
          role: 'hardware-safety' 
        });
      }
    }

    // 2. Parallel evaluation
    const evaluations = await Promise.all(
      advisorsToConsult.map(key => 
        this.advisors[key].evaluate(action).catch(err => ({
          decision: 'ESCALATE' as TrinaryDecision,
          risk: 0.9,
          scope: ['local'] as Array<"local" | "mesh" | "external" | "hardware">,
          reason: `Advisor ${key} unavailable: ${err.message}`,
          estimated_deltaS: 0,
          error: err.message
        }))
      )
    );

    // 3. Synthesize results
    const validEvals = evaluations.filter(e => !e.error);
    if (validEvals.length === 0) {
      return this._emergencyBlock(action, 'All advisors failed');
    }

    // Risk: average, capped
    const avgRisk = Math.min(1.0, validEvals.reduce((sum, e) => sum + (e.risk || 0.5), 0) / validEvals.length);
    
    // Scope: union
    const scope = [...new Set(validEvals.flatMap(e => e.scope || []))];
    
    // Decision: consensus or escalate
    const decisions = validEvals.map(e => e.decision);
    const decision: TrinaryDecision = 
      decisions.every(d => d === 'ALLOW') ? 'ALLOW' :
      decisions.every(d => d === 'BLOCK') ? 'BLOCK' :
      'ESCALATE';
    
    // Syntropy alignment: average deltaS
    const avgDeltaS = validEvals.reduce((sum, e) => sum + (e.estimated_deltaS || 0), 0) / validEvals.length;
    
    // Explanation: concise synthesis
    const explanation = validEvals.map(e => `${e.reason}`).join(' | ');
    
    // ZYLPHA hash for audit
    const zylphaHash = crypto.createHash('sha3-256')
      .update(JSON.stringify({ action, decision, avgRisk, avgDeltaS }) + Date.now())
      .digest('hex');

    // Signature (if session key available)
    const signature = this.sessionKey
      ? crypto.createHmac('sha3-256', this.sessionKey)
          .update(`${decision}:${zylphaHash}`)
          .digest('hex')
      : undefined;

    return {
      action,
      decision,
      riskScore: parseFloat(avgRisk.toFixed(3)),
      impactScope: scope,
      explanation,
      syntropy_alignment: {
        estimated_deltaS: parseFloat(avgDeltaS.toFixed(2)),
        coherence_gain: avgDeltaS < 0 && decision !== 'BLOCK'
      },
      audit: {
        modelsConsulted: validEvals.map((_, i) => advisorsToConsult[i]),
        timestamp: new Date().toISOString(),
        zylpha_hash: zylphaHash
      },
      signature
    };
  }

  _emergencyBlock(action: ProposedAction, reason: string): TrinaryResult {
    return {
      action,
      decision: 'BLOCK',
      riskScore: 1.0,
      impactScope: ['local'],
      explanation: `Emergency block: ${reason}`,
      syntropy_alignment: { estimated_deltaS: 0, coherence_gain: false },
      audit: {
        modelsConsulted: [],
        timestamp: new Date().toISOString(),
        zylpha_hash: 'EMERGENCY_BLOCK'
      }
    };
  }
}
