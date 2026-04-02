import { AgentMessage } from '../adapters/agent-adapter.interface';
import { TranscriptEntry } from './interfaces/job-data.interface';

/**
 * Persona traits passed to strategies for prompt generation and behavior decisions.
 */
export interface PersonaTraits {
  name: string;
  emotion?: string;
  speechStyle?: string;
  intentClarity?: string;
  backgroundNoise?: boolean;
  description?: string;
  backstory?: string;
  gender?: string;
  language?: string;
  accent?: string;
  behavior?: {
    personality?: string;
    emotionalState?: string;
    cooperationLevel?: string;
    patience?: string;
    communicationStyle?: string;
  };
  conversationTraits?: {
    allowInterruptions?: boolean;
    interruptionFrequency?: string;
    asksClarifyingQuestions?: boolean;
    repeatsInformation?: boolean;
    goesOffTopic?: boolean;
  };
  variables?: Record<string, string>;
}

/**
 * Context provided to persona strategies for each utterance generation.
 */
export interface PersonaStrategyContext {
  personaTraits: PersonaTraits;
  systemPrompt: string;
  history: AgentMessage[];
  lastAgentResponse: string;
  turn: number;
  transcript: TranscriptEntry[];
  scenarioPrompt: string;
  adapterType?: string;
  adapterConfig?: Record<string, any>;
}

/**
 * Tool definition for internal persona tools.
 * These are structured-output tools the persona LLM can call to reason
 * about the agent's behavior before generating its visible response.
 */
export interface PersonaToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON Schema
}

/**
 * Pluggable persona strategy interface.
 * Mirrors the AgentAdapter pattern — register strategies in PersonaStrategyRegistry.
 *
 * Built-in strategies:
 * - 'default': Standard LLM persona (wraps existing persona-llm.ts behavior)
 * - 'reactive': Tool-augmented persona that analyzes agent responses before replying
 */
export interface PersonaStrategy {
  readonly type: string;

  /**
   * Generate the persona's opening message for the conversation.
   * Return null to fall back to heuristic opening.
   */
  generateOpening(ctx: PersonaStrategyContext): Promise<string | null>;

  /**
   * Generate the persona's next utterance in the conversation.
   * Return null to fall back to heuristic generation.
   */
  generateUtterance(ctx: PersonaStrategyContext): Promise<string | null>;

  /**
   * Optional: mutate the system prompt mid-conversation based on agent behavior.
   * Return null to keep the current prompt unchanged.
   */
  updateSystemPrompt?(ctx: PersonaStrategyContext): Promise<string | null>;

  /**
   * Optional: declare internal tools available to the persona LLM.
   * These are self-reflective tools — the LLM reasons about the conversation.
   */
  getInternalTools?(): PersonaToolDefinition[];
}
