import {
  PersonaStrategy,
  PersonaStrategyContext,
} from '../persona-strategy.interface';
import {
  generatePersonaUtterance,
  generatePersonaOpening,
} from '../persona-llm';

/**
 * Default persona strategy — wraps the existing persona-llm.ts behavior.
 * No internal tools, no dynamic prompt mutation. Backward compatible.
 */
export class DefaultPersonaStrategy implements PersonaStrategy {
  readonly type = 'default';

  async generateOpening(ctx: PersonaStrategyContext): Promise<string | null> {
    return generatePersonaOpening({
      personaSystemPrompt: ctx.systemPrompt,
      scenarioPrompt: ctx.scenarioPrompt,
      adapterType: ctx.adapterType,
      adapterConfig: ctx.adapterConfig,
    });
  }

  async generateUtterance(ctx: PersonaStrategyContext): Promise<string | null> {
    return generatePersonaUtterance({
      personaSystemPrompt: ctx.systemPrompt,
      history: ctx.history,
      adapterType: ctx.adapterType,
      adapterConfig: ctx.adapterConfig,
    });
  }
}
