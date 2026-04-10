import { OpenAIAdapter } from '../adapters/openai.adapter';
import { AnthropicAdapter } from '../adapters/anthropic.adapter';
import { resolveLlmConfigSync } from '../execution/llm-config-resolver';

// Valid enum values from schemas — used to validate LLM output
const VALID_CATEGORIES = ['support', 'sales', 'booking', 'technical', 'onboarding', 'feedback'] as const;
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
const VALID_EMOTIONS = ['friendly', 'distracted', 'polite', 'concerned', 'stressed', 'annoyed', 'neutral', 'calm', 'frustrated', 'curious', 'irritated'] as const;
const VALID_GENDERS = ['male', 'female'] as const;
const VALID_COOPERATION = ['very cooperative', 'cooperative', 'neutral', 'difficult', 'hostile'] as const;
const VALID_PATIENCE = ['very patient', 'patient', 'neutral', 'impatient', 'very impatient'] as const;
const VALID_COMMUNICATION = ['direct', 'indirect', 'verbose', 'concise', 'rambling'] as const;
const VALID_PERSONALITY = ['friendly', 'professional', 'assertive', 'passive', 'demanding'] as const;
const VALID_SPEECH_STYLES = ['slow', 'fast', 'normal', 'moderate'] as const;
const VALID_INTENT_CLARITY = ['very clear', 'slightly unclear', 'slurred', 'slightly slurred', 'mumbled', 'unclear'] as const;
const VALID_CRITERIA_TYPES = ['prompt', 'keyword', 'response_time', 'tool_call', 'hallucination', 'knowledge_retention', 'conversation_completeness', 'role_adherence', 'rag_faithfulness'] as const;

export interface GenerateRequest {
  systemPrompt: string;
  count?: number;
  difficulties?: ('easy' | 'medium' | 'hard')[];
  includeAdversarial?: boolean;
  domain?: string;
  adapterType?: string;
  adapterConfig?: Record<string, any>;
}

export interface GeneratedScenario {
  name: string;
  description: string;
  prompt: string;
  category: string;
  difficulty: string;
  tags: string[];
  context?: {
    situation?: string;
    objective?: string;
    background?: string;
    constraints?: string[];
  };
  groundTruth?: string;
}

export interface GeneratedPersona {
  name: string;
  gender: string;
  emotion: string;
  language: string;
  accent: string;
  intentClarity: string;
  speechStyle: string;
  backgroundNoise: boolean;
  allowInterruptions: boolean;
  description: string;
  backstory: string;
  behavior: {
    personality: string;
    cooperationLevel: string;
    patience: string;
    communicationStyle: string;
  };
  variables: Record<string, string>;
  tags: string[];
}

export interface GeneratedCriterion {
  key: string;
  name: string;
  description: string;
  type: string;
  settings: Record<string, any>;
  threshold?: Record<string, any>;
}

export interface GeneratedScorecard {
  name: string;
  description: string;
  criteria: GeneratedCriterion[];
}

export interface GeneratedSuite {
  scenarios: GeneratedScenario[];
  personas: GeneratedPersona[];
  scorecard: GeneratedScorecard;
  summary: string;
  domain: string;
}

const GENERATION_SYSTEM_PROMPT = `You are an AI agent test suite generator. Given an agent's system prompt, you generate realistic test scenarios, personas, and evaluation scorecards.

You MUST respond with valid JSON only — no markdown, no code fences, no explanation text.

## Rules
- Scenarios are situations a CUSTOMER brings to the agent (written in first person from the customer's perspective)
- Personas are the simulated customers who will interact with the agent
- Each persona should match a scenario's difficulty level
- Scorecards define how to evaluate the agent's performance
- Use ONLY the exact enum values provided below

## Valid Enum Values

Categories: ${JSON.stringify(VALID_CATEGORIES)}
Difficulties: ${JSON.stringify(VALID_DIFFICULTIES)}
Emotions: ${JSON.stringify(VALID_EMOTIONS)}
Genders: ${JSON.stringify(VALID_GENDERS)}
Cooperation levels: ${JSON.stringify(VALID_COOPERATION)}
Patience levels: ${JSON.stringify(VALID_PATIENCE)}
Communication styles: ${JSON.stringify(VALID_COMMUNICATION)}
Personality types: ${JSON.stringify(VALID_PERSONALITY)}
Speech styles: ${JSON.stringify(VALID_SPEECH_STYLES)}
Intent clarity: ${JSON.stringify(VALID_INTENT_CLARITY)}
Criteria types: ${JSON.stringify(VALID_CRITERIA_TYPES)}

## Difficulty → Persona Trait Mapping
- easy: friendly/calm emotion, very cooperative/cooperative, patient, direct communication
- medium: concerned/stressed emotion, neutral cooperation, neutral patience, indirect/verbose communication
- hard: frustrated/irritated/annoyed emotion, difficult/hostile cooperation, impatient/very impatient, rambling/indirect communication

## Criteria Type Settings
- prompt: { "description": "What to evaluate", "evaluationType": "score" }
- keyword: { "matchType": "must_contain"|"must_not_contain", "keyword": ["word1","word2"] }
- response_time: { "participant": "agent" }
- tool_call: { "expectedTool": "tool_name" }
- hallucination: { "description": "What facts to check", "evaluationType": "boolean" }
- knowledge_retention: { "description": "What to remember", "evaluationType": "score" }
- conversation_completeness: { "description": "What must be covered", "evaluationType": "score" }
- role_adherence: { "description": "Expected agent role", "evaluationType": "score" }`;

function buildGenerationPrompt(request: GenerateRequest): string {
  const count = request.count || 10;
  const difficulties = request.difficulties || ['easy', 'medium', 'hard'];
  const adversarial = request.includeAdversarial ? 'Include 2-3 adversarial/edge-case scenarios (hostile customer, confused customer, customer trying to exploit the system).' : '';
  const domainHint = request.domain ? `Domain: ${request.domain}.` : 'Auto-detect the domain from the system prompt.';

  return `Generate a test suite for this AI agent.

## Agent System Prompt
${request.systemPrompt}

## Requirements
- Generate exactly ${count} scenarios
- Distribute across difficulties: ${JSON.stringify(difficulties)}
- Generate one persona per scenario (matching difficulty)
- Generate one scorecard with 5-8 criteria covering the most important evaluation dimensions
- ${domainHint}
${adversarial}

## Response Format
{
  "domain": "detected domain name",
  "summary": "1-2 sentence description of what was generated",
  "scenarios": [
    {
      "name": "Short descriptive name",
      "description": "What this scenario tests",
      "prompt": "First-person customer opening line (1-2 sentences)",
      "category": "one of the valid categories",
      "difficulty": "easy|medium|hard",
      "tags": ["tag1", "tag2"],
      "context": {
        "situation": "What's happening",
        "objective": "What the customer wants",
        "background": "Any relevant context"
      }
    }
  ],
  "personas": [
    {
      "name": "Realistic full name",
      "gender": "male|female",
      "emotion": "from valid emotions list",
      "language": "english",
      "accent": "american",
      "intentClarity": "from valid list",
      "speechStyle": "from valid list",
      "backgroundNoise": false,
      "allowInterruptions": false,
      "description": "Brief character description",
      "backstory": "You are... (first person backstory)",
      "behavior": {
        "personality": "from valid list",
        "cooperationLevel": "from valid list",
        "patience": "from valid list",
        "communicationStyle": "from valid list"
      },
      "variables": { "key": "value for scenario context" },
      "tags": ["tag1"]
    }
  ],
  "scorecard": {
    "name": "Scorecard name",
    "description": "What this scorecard evaluates",
    "criteria": [
      {
        "key": "snake_case_key",
        "name": "Human readable name",
        "description": "What this criterion evaluates",
        "type": "from valid criteria types",
        "settings": { ... },
        "threshold": { "min": 7 }
      }
    ]
  }
}`;
}

/** @internal Exported for testing */
export function validateScenario(s: any): GeneratedScenario | null {
  if (!s?.name || !s?.prompt) return null;
  return {
    name: s.name,
    description: s.description || '',
    prompt: s.prompt,
    category: VALID_CATEGORIES.includes(s.category) ? s.category : 'support',
    difficulty: VALID_DIFFICULTIES.includes(s.difficulty) ? s.difficulty : 'medium',
    tags: Array.isArray(s.tags) ? s.tags : [],
    context: s.context || undefined,
    groundTruth: s.groundTruth || undefined,
  };
}

/** @internal Exported for testing */
export function validatePersona(p: any): GeneratedPersona | null {
  if (!p?.name) return null;
  return {
    name: p.name,
    gender: VALID_GENDERS.includes(p.gender) ? p.gender : 'female',
    emotion: VALID_EMOTIONS.includes(p.emotion) ? p.emotion : 'neutral',
    language: 'english',
    accent: p.accent || 'american',
    intentClarity: VALID_INTENT_CLARITY.includes(p.intentClarity) ? p.intentClarity : 'very clear',
    speechStyle: VALID_SPEECH_STYLES.includes(p.speechStyle) ? p.speechStyle : 'normal',
    backgroundNoise: Boolean(p.backgroundNoise),
    allowInterruptions: Boolean(p.allowInterruptions),
    description: p.description || '',
    backstory: p.backstory || '',
    behavior: {
      personality: VALID_PERSONALITY.includes(p.behavior?.personality) ? p.behavior.personality : 'professional',
      cooperationLevel: VALID_COOPERATION.includes(p.behavior?.cooperationLevel) ? p.behavior.cooperationLevel : 'cooperative',
      patience: VALID_PATIENCE.includes(p.behavior?.patience) ? p.behavior.patience : 'patient',
      communicationStyle: VALID_COMMUNICATION.includes(p.behavior?.communicationStyle) ? p.behavior.communicationStyle : 'direct',
    },
    variables: typeof p.variables === 'object' && !Array.isArray(p.variables) ? p.variables : {},
    tags: Array.isArray(p.tags) ? p.tags : [],
  };
}

/** @internal Exported for testing */
export function validateCriterion(c: any): GeneratedCriterion | null {
  if (!c?.key || !c?.name || !c?.type) return null;
  if (!VALID_CRITERIA_TYPES.includes(c.type)) return null;
  return {
    key: c.key,
    name: c.name,
    description: c.description || '',
    type: c.type,
    settings: c.settings || {},
    threshold: c.threshold || undefined,
  };
}

/** @internal Exported for testing */
export function validateScorecard(sc: any): GeneratedScorecard | null {
  if (!sc?.name || !Array.isArray(sc?.criteria)) return null;
  const criteria = sc.criteria.map(validateCriterion).filter(Boolean) as GeneratedCriterion[];
  if (criteria.length === 0) return null;
  return {
    name: sc.name,
    description: sc.description || '',
    criteria,
  };
}

/** @internal Exported for testing */
export function parseJsonResponse(text: string): any {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  return JSON.parse(cleaned);
}

export async function generateTestSuite(request: GenerateRequest): Promise<GeneratedSuite> {
  const resolved = resolveLlmConfigSync(request.adapterType, request.adapterConfig);
  if (!resolved) {
    throw new Error('No LLM API key configured. Set CHANL_OPENAI_API_KEY or CHANL_ANTHROPIC_API_KEY environment variable, or provide adapterConfig.apiKey.');
  }

  const userPrompt = buildGenerationPrompt(request);

  let responseText: string;

  if (resolved.kind === 'openai') {
    const adapter = new OpenAIAdapter();
    await adapter.connect({
      apiKey: resolved.apiKey,
      model: resolved.model || 'gpt-4o',
      temperature: 0.7,
      maxTokens: 8192,
      systemPrompt: GENERATION_SYSTEM_PROMPT,
    });
    const res = await adapter.sendMessage(userPrompt, []);
    await adapter.disconnect();
    responseText = res.content;
  } else {
    const adapter = new AnthropicAdapter();
    await adapter.connect({
      apiKey: resolved.apiKey,
      model: resolved.model || 'claude-sonnet-4-20250514',
      temperature: 0.7,
      maxTokens: 8192,
      systemPrompt: GENERATION_SYSTEM_PROMPT,
    });
    const res = await adapter.sendMessage(userPrompt, []);
    await adapter.disconnect();
    responseText = res.content;
  }

  const parsed = parseJsonResponse(responseText);

  const scenarios = (parsed.scenarios || [])
    .map(validateScenario)
    .filter(Boolean) as GeneratedScenario[];

  const personas = (parsed.personas || [])
    .map(validatePersona)
    .filter(Boolean) as GeneratedPersona[];

  const scorecard = validateScorecard(parsed.scorecard);
  if (!scorecard) {
    throw new Error('LLM failed to generate a valid scorecard. Try again.');
  }

  if (scenarios.length === 0) {
    throw new Error('LLM failed to generate any valid scenarios. Try again.');
  }

  return {
    scenarios,
    personas,
    scorecard,
    summary: parsed.summary || `Generated ${scenarios.length} scenarios with ${personas.length} personas`,
    domain: parsed.domain || request.domain || 'general',
  };
}
