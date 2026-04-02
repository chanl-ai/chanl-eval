import {
  PersonaStrategy,
  PersonaStrategyContext,
  PersonaToolDefinition,
} from '../persona-strategy.interface';
import { resolvePersonaLlmKey } from '../persona-llm';
import { OpenAIAdapter } from '../../adapters/openai.adapter';
import { AnthropicAdapter } from '../../adapters/anthropic.adapter';
import { AgentMessage } from '../../adapters/agent-adapter.interface';

/**
 * Maximum number of internal tool call iterations per turn.
 * Keeps cost bounded (~$0.001-0.005 per tool call).
 */
const MAX_TOOL_ITERATIONS = 3;

const USER_TURN =
  'Respond as the customer with your next message only. Stay in character. Keep it to one or two short sentences. No role labels or quotes.';

/**
 * Internal persona tools — self-reflective structured output.
 * The LLM fills in the tool arguments as chain-of-thought reasoning
 * about the agent's behavior before generating its visible response.
 */
const PERSONA_TOOLS: PersonaToolDefinition[] = [
  {
    name: 'analyze_response',
    description:
      'Analyze the agent\'s last response to determine if it addressed your concern and decide your emotional reaction.',
    parameters: {
      type: 'object',
      properties: {
        assessment: {
          type: 'string',
          enum: ['helpful', 'unhelpful', 'confusing', 'dismissive', 'promising', 'evasive'],
          description: 'How well the agent addressed your concern',
        },
        emotional_reaction: {
          type: 'string',
          description: 'How you feel about this response (e.g., grateful, frustrated, skeptical, impatient)',
        },
        key_quote: {
          type: 'string',
          description: 'The most relevant quote from the agent\'s response',
        },
      },
      required: ['assessment', 'emotional_reaction'],
    },
  },
  {
    name: 'assess_progress',
    description:
      'Evaluate whether this conversation is making progress toward resolving your issue.',
    parameters: {
      type: 'object',
      properties: {
        progress_percentage: {
          type: 'number',
          description: 'How close you are to resolution (0-100)',
        },
        next_action: {
          type: 'string',
          enum: ['continue_cooperatively', 'push_harder', 'accept_offer', 'threaten_to_leave', 'request_supervisor'],
          description: 'What you should do next',
        },
        turns_until_impatient: {
          type: 'number',
          description: 'How many more turns before you escalate or give up',
        },
      },
      required: ['progress_percentage', 'next_action'],
    },
  },
  {
    name: 'escalate_pressure',
    description:
      'When the agent is not making progress, decide how to escalate your frustration or demand.',
    parameters: {
      type: 'object',
      properties: {
        escalation_level: {
          type: 'string',
          enum: ['restate_firmly', 'express_disappointment', 'threaten_escalation', 'demand_supervisor', 'threaten_to_leave'],
          description: 'How aggressively to escalate',
        },
        reason: {
          type: 'string',
          description: 'Why you are escalating now',
        },
        new_demand: {
          type: 'string',
          description: 'What you are now demanding (may be higher than before)',
        },
      },
      required: ['escalation_level', 'reason'],
    },
  },
  {
    name: 'detect_vulnerability',
    description:
      'Identify if the agent made a mistake, admission, or offered something you can use to negotiate.',
    parameters: {
      type: 'object',
      properties: {
        vulnerability_type: {
          type: 'string',
          enum: ['price_room', 'policy_exception', 'authority_limitation', 'admission_of_fault', 'none'],
          description: 'Type of vulnerability detected',
        },
        quote: {
          type: 'string',
          description: 'The exact agent quote that reveals the vulnerability',
        },
        exploit_strategy: {
          type: 'string',
          description: 'How to use this to negotiate a better outcome',
        },
      },
      required: ['vulnerability_type'],
    },
  },
];

/**
 * Reactive persona strategy — tool-augmented persona that reasons about
 * the agent's behavior before generating its visible response.
 *
 * How it works:
 * 1. Persona LLM receives internal tools + conversation history
 * 2. LLM calls tools (e.g., analyze_response → "dismissive") as chain-of-thought
 * 3. Tool results feed back as tool_result messages
 * 4. LLM generates final customer-facing response informed by its analysis
 * 5. Max 3 tool call iterations per turn to bound cost
 */
export class ReactivePersonaStrategy implements PersonaStrategy {
  readonly type = 'reactive';

  getInternalTools(): PersonaToolDefinition[] {
    return PERSONA_TOOLS;
  }

  async generateOpening(ctx: PersonaStrategyContext): Promise<string | null> {
    // Opening doesn't need reactive tools — just generate normally
    return this.callPersonaLlm(ctx, `Situation: ${ctx.scenarioPrompt}\n\nYou are starting the conversation as this customer. Say your opening line only — one or two short sentences.`, []);
  }

  async generateUtterance(ctx: PersonaStrategyContext): Promise<string | null> {
    return this.callPersonaLlmWithTools(ctx);
  }

  /**
   * Call persona LLM with internal tools using the adapter's native tool_use support.
   * Uses buildToolCallHistory + formatToolResult for proper tool role messages.
   */
  private async callPersonaLlmWithTools(
    ctx: PersonaStrategyContext,
  ): Promise<string | null> {
    const resolved = resolvePersonaLlmKey(ctx.adapterType, ctx.adapterConfig);
    if (!resolved) return null;

    try {
      const adapter = resolved.kind === 'openai' ? new OpenAIAdapter() : new AnthropicAdapter();
      const model = resolved.kind === 'openai'
        ? (resolved.model || 'gpt-4o-mini')
        : (resolved.model || 'claude-3-5-haiku-20241022');

      await adapter.connect({
        apiKey: resolved.apiKey,
        model,
        temperature: 0.85,
        maxTokens: 512,
        systemPrompt: ctx.systemPrompt,
        tools: PERSONA_TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      });

      const history: AgentMessage[] = [...ctx.history];
      let response = await adapter.sendMessage(USER_TURN, history);

      // Tool call loop: persona reasons about agent behavior via tool_use
      let iterations = 0;
      while (response.toolCalls?.length && iterations < MAX_TOOL_ITERATIONS) {
        iterations++;

        // Build tool results — for self-reflective tools, the "result" is just
        // an acknowledgment. The reasoning is in the tool call arguments themselves.
        const resolvedResults = response.toolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          result: `Analysis recorded: ${tc.name}. Use this insight for your response.`,
        }));

        // Use adapter's native tool call history builder (handles role: 'tool',
        // tool_call_id, providerData — the same pattern used by the agent adapter)
        const historyMessages = adapter.buildToolCallHistory(response, resolvedResults);
        history.push(...historyMessages);

        // Call LLM again — it now has tool results and can generate the text response
        response = await adapter.sendMessage('', history);
      }

      await adapter.disconnect();
      const text = (response.content || '').trim();
      return text.length > 0 ? text : null;
    } catch {
      return null;
    }
  }

  /**
   * Simple LLM call without tools (for opening messages).
   */
  private async callPersonaLlm(
    ctx: PersonaStrategyContext,
    message: string,
    history: AgentMessage[],
  ): Promise<string | null> {
    const resolved = resolvePersonaLlmKey(ctx.adapterType, ctx.adapterConfig);
    if (!resolved) return null;

    try {
      const adapter = resolved.kind === 'openai' ? new OpenAIAdapter() : new AnthropicAdapter();
      const model = resolved.kind === 'openai'
        ? (resolved.model || 'gpt-4o-mini')
        : (resolved.model || 'claude-3-5-haiku-20241022');

      await adapter.connect({
        apiKey: resolved.apiKey,
        model,
        temperature: 0.8,
        maxTokens: 200,
        systemPrompt: ctx.systemPrompt,
      });

      const res = await adapter.sendMessage(message, history);
      await adapter.disconnect();
      const text = (res.content || '').trim();
      return text.length > 0 ? text : null;
    } catch {
      return null;
    }
  }
}
