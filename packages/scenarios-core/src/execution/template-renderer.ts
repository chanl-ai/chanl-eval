import { Liquid } from 'liquidjs';
import { Logger } from '@nestjs/common';
import { PersonaTraits } from '../simulator/persona-simulator.service';

const logger = new Logger('TemplateRenderer');
const liquid = new Liquid({
  strictVariables: false,
  strictFilters: false,
  lenientIf: true,
});

/**
 * Variable context available in Liquid persona templates.
 *
 * OSS version provides: persona.*, scenario.*, and custom promptVariables.
 * chanl cloud extends with: derived.*, behavior.*, conversationTraits.*,
 * and runtime variable overrides.
 */
export interface TemplateVariables {
  persona: {
    name: string;
    emotion: string;
    speechStyle: string;
    intentClarity: string;
    description?: string;
    backstory?: string;
    gender?: string;
    language?: string;
    accent?: string;
    [key: string]: string | undefined;
  };
  scenario: {
    prompt: string;
    name?: string;
    description?: string;
    category?: string;
    difficulty?: string;
    [key: string]: string | undefined;
  };
  [key: string]: unknown;
}

/**
 * Build the variable context for Liquid template rendering.
 */
export function buildTemplateVariables(
  persona: PersonaTraits,
  scenarioPrompt: string,
  scenarioMeta?: {
    name?: string;
    description?: string;
    category?: string;
    difficulty?: string;
    promptVariables?: Array<{ name: string; defaultValue: string }>;
  },
): TemplateVariables {
  const vars: TemplateVariables = {
    persona: {
      name: persona.name,
      emotion: persona.emotion,
      speechStyle: persona.speechStyle,
      intentClarity: persona.intentClarity,
      description: persona.description,
      backstory: persona.backstory,
      gender: persona.gender,
      language: persona.language,
      accent: persona.accent,
    },
    scenario: {
      prompt: scenarioPrompt,
      name: scenarioMeta?.name,
      description: scenarioMeta?.description,
      category: scenarioMeta?.category,
      difficulty: scenarioMeta?.difficulty,
    },
  };

  // Add behavioral traits as flat keys for template convenience
  if (persona.behavior) {
    const b = persona.behavior;
    if (b.cooperationLevel) vars.persona['cooperationLevel'] = b.cooperationLevel;
    if (b.patience) vars.persona['patience'] = b.patience;
    if (b.communicationStyle) vars.persona['communicationStyle'] = b.communicationStyle;
    if (b.personality) vars.persona['personality'] = b.personality;
    if (b.emotionalState) vars.persona['emotionalState'] = b.emotionalState;
  }

  // Merge persona custom variables (from UI key-value editor)
  // Available as {{persona.product_name}}, {{persona.order_id}}, etc.
  if (persona.variables) {
    for (const [k, v] of Object.entries(persona.variables)) {
      if (k && v != null) vars.persona[k] = String(v);
    }
  }

  // Add custom promptVariables as top-level keys
  if (scenarioMeta?.promptVariables) {
    for (const v of scenarioMeta.promptVariables) {
      if (v.name && v.defaultValue != null) {
        vars[v.name] = v.defaultValue;
      }
    }
  }

  return vars;
}

/**
 * Render a Liquid template with persona + scenario variables.
 *
 * Returns the rendered string, or null if rendering fails (with a warning).
 * Callers should fall back to the code-generated prompt on null.
 */
export async function renderPersonaTemplate(
  template: string,
  variables: TemplateVariables,
): Promise<string | null> {
  try {
    const rendered = await liquid.parseAndRender(template, variables);
    const trimmed = rendered.trim();
    if (!trimmed) {
      logger.warn('Liquid template rendered to empty string — falling back to code-generated prompt');
      return null;
    }
    return trimmed;
  } catch (err: any) {
    logger.warn(`Liquid template rendering failed: ${err?.message || err} — falling back to code-generated prompt`);
    return null;
  }
}
