/**
 * Shared types for the eval SDK.
 *
 * These types are defined locally to avoid importing from core packages,
 * keeping the SDK dependency-free from server internals.
 */

// ============================================================================
// PAGINATION
// ============================================================================

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage?: boolean;
  hasPrevPage?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  pagination: Pagination;
}

// ============================================================================
// PROMPTS
// ============================================================================

export interface Prompt {
  id: string;
  name: string;
  description?: string;
  content: string;
  status?: string;
  tags?: string[];
  adapterConfig?: {
    adapterType?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface CreatePromptDto {
  name: string;
  description?: string;
  content: string;
  status?: 'active' | 'draft' | 'archived';
  tags?: string[];
  adapterConfig?: {
    adapterType?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
}

export interface UpdatePromptDto extends Partial<CreatePromptDto> {}

export interface ListPromptsParams {
  status?: string;
  page?: number;
  limit?: number;
}

export interface ListPromptsResponse {
  prompts: Prompt[];
  total: number;
}

// ============================================================================
// SCENARIOS
// ============================================================================

export interface Scenario {
  id: string;
  name: string;
  description?: string;
  prompt: string;
  context?: {
    situation?: string;
    objective?: string;
    background?: string;
    constraints?: string[];
  };
  status?: string;
  category?: string;
  difficulty?: string;
  tags?: string[];
  personaIds?: string[];
  scorecardId?: string;
  simulationMode?: 'text' | 'websocket' | 'phone';
  phoneNumber?: string;
  promptVariables?: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'array';
    defaultValue: string;
    description?: string;
    required?: boolean;
  }>;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateScenarioDto {
  name: string;
  description?: string;
  prompt: string;
  context?: {
    situation?: string;
    objective?: string;
    background?: string;
    constraints?: string[];
  };
  status?: 'draft' | 'active' | 'paused' | 'completed' | 'archived';
  category?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  tags?: string[];
  personaIds: string[];
  scorecardId?: string;
  simulationMode?: 'text' | 'websocket' | 'phone';
  phoneNumber?: string;
  promptVariables?: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'array';
    defaultValue: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface UpdateScenarioDto extends Partial<CreateScenarioDto> {}

export interface ListScenariosParams {
  status?: string;
  category?: string;
  difficulty?: string;
  tags?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ListScenariosResponse {
  scenarios: Scenario[];
  total: number;
  pagination?: Pagination;
}

// ============================================================================
// EXECUTIONS
// ============================================================================

export interface Execution {
  id: string;
  /** UUID format: exec_<uuid>. Used to link scorecard results. */
  executionId?: string;
  scenarioId: string;
  /** The Prompt entity used for this execution */
  promptId?: string;
  personaId?: string;
  status: string;
  mode?: 'text' | 'phone';
  triggerId?: string;
  triggeredBy?: string;
  startTime?: string;
  endTime?: string;
  duration?: number;
  overallScore?: number;
  errorMessages?: string[];
  stepResults?: Array<{
    stepId: string;
    status: string;
    role?: 'persona' | 'agent' | 'tool';
    actualResponse?: string;
    expectedResponse?: string;
    score?: number;
    duration?: number;
    startTime?: string;
    endTime?: string;
    errorMessages?: string[];
    metadata?: Record<string, any>;
  }>;
  scorecardResults?: ScorecardEvaluationResult;
  createdAt?: string;
  updatedAt?: string;
}

export interface ExecuteScenarioDto {
  /** The Prompt entity that defines the agent under test (required) */
  promptId: string;
  mode?: 'text' | 'phone';
  phoneNumber?: string;
  personaId?: string;
  scorecardId?: string;
  toolFixtureIds?: string[];
  parameters?: Record<string, any>;
  triggerId?: string;
  environment?: string;
  priority?: number;
  dryRun?: boolean;
}

export interface ListExecutionsParams {
  scenarioId?: string;
  promptId?: string;
  personaId?: string;
  status?: string;
  triggerId?: string;
  triggeredBy?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

export interface ListExecutionsResponse {
  executions: Execution[];
  total: number;
  pagination?: Pagination;
}

export interface WaitForCompletionOptions {
  /** Polling interval in milliseconds (default: 2000) */
  intervalMs?: number;
  /** Maximum time to wait in milliseconds (default: 300000 = 5 min) */
  timeoutMs?: number;
}

export interface EvaluateExecutionRequest {
  scorecardId: string;
  /** Optional OpenAI API key for the LLM judge. Falls back to server-configured key. */
  apiKey?: string;
}

export interface ScorecardEvaluationResult {
  scorecardId: string;
  resultId: string;
  overallScore: number;
  passed: boolean;
  categoryScores: Record<string, number>;
  criteriaResults: Array<{
    criteriaId: string;
    criteriaKey: string;
    criteriaName?: string;
    categoryId: string;
    categoryName?: string;
    passed: boolean;
    result: any;
    reasoning?: string;
    evidence?: string[];
  }>;
  evaluatedAt: string;
}

// ============================================================================
// PERSONAS
// ============================================================================

export interface Persona {
  id: string;
  name: string;
  gender: string;
  emotion: string;
  language: string;
  accent: string;
  intentClarity: string;
  speechStyle: string;
  backgroundNoise: boolean;
  allowInterruptions: boolean;
  description?: string;
  backstory?: string;
  variables?: Record<string, string>;
  voiceId?: string;
  voiceProvider?: string;
  tags?: string[];
  agentId?: string;
  agentConfig?: {
    promptTemplate?: string;
    voice?: {
      voiceId?: string;
      provider?: string;
    };
    behavior?: {
      interruptionFrequency?: string;
      responseSpeed?: string;
      verbosity?: string;
    };
  };
  voice?: {
    gender?: string;
    age?: string;
    accent?: string;
    clarity?: string;
    pace?: string;
    volume?: string;
    tone?: string;
    voiceId?: string;
    provider?: string;
  };
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
  environment?: {
    backgroundNoise?: boolean;
    noiseType?: string;
    connectionQuality?: string;
  };
  isActive?: boolean;
  isDefault?: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreatePersonaDto {
  name: string;
  gender: string;
  emotion: string;
  language: string;
  accent: string;
  intentClarity: string;
  speechStyle: string;
  backgroundNoise: boolean;
  allowInterruptions: boolean;
  description?: string;
  backstory?: string;
  variables?: Record<string, string>;
  voiceId?: string;
  voiceProvider?: string;
  tags?: string[];
  agentId?: string;
  agentConfig?: {
    promptTemplate?: string;
    voice?: {
      voiceId?: string;
      provider?: string;
    };
    behavior?: {
      interruptionFrequency?: string;
      responseSpeed?: string;
      verbosity?: string;
    };
  };
  voice?: {
    gender?: string;
    age?: string;
    accent?: string;
    clarity?: string;
    pace?: string;
    volume?: string;
    tone?: string;
    voiceId?: string;
    provider?: string;
  };
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
  environment?: {
    backgroundNoise?: boolean;
    noiseType?: string;
    connectionQuality?: string;
  };
}

export interface UpdatePersonaDto extends Partial<CreatePersonaDto> {
  isActive?: boolean;
  isDefault?: boolean;
}

export interface ListPersonasParams {
  emotion?: string;
  language?: string;
  gender?: string;
  accent?: string;
  isActive?: boolean;
  isDefault?: boolean;
  tags?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ListPersonasResponse {
  personas: Persona[];
  total: number;
  pagination?: Pagination;
}

// ============================================================================
// SCORECARDS
// ============================================================================

export interface Scorecard {
  id: string;
  name: string;
  description?: string;
  status?: string;
  passingThreshold?: number;
  scoringAlgorithm?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ScorecardCategory {
  id: string;
  scorecardId: string;
  name: string;
  description?: string;
  weight?: number;
  order?: number;
}

export interface ScorecardCriteria {
  id: string;
  scorecardId: string;
  categoryId: string;
  name: string;
  description?: string;
  type?: string;
  weight?: number;
  passingThreshold?: number;
  settings?: Record<string, unknown>;
  threshold?: Record<string, unknown>;
  isActive?: boolean;
}

export interface ScorecardCriteriaResult {
  criteriaId: string;
  criteriaKey: string;
  criteriaName: string;
  categoryId: string;
  categoryName: string;
  result: boolean | number | string;
  passed: boolean;
  reasoning: string;
  evidence: string[];
  criteriaVersion?: number;
  categoryVersion?: number;
}

export interface ScorecardResult {
  id: string;
  scorecardId: string;
  scenarioExecutionId?: string;
  callId?: string;
  executionId?: string;
  overallScore?: number;
  status?: string;
  categoryScores?: Array<{
    categoryId: string;
    categoryName?: string;
    score: number;
    passed: boolean;
  }>;
  criteriaResults?: ScorecardCriteriaResult[];
  /** @deprecated Use criteriaResults instead */
  criteriaScores?: Array<{
    criteriaId: string;
    score: number;
    passed: boolean;
    feedback?: string;
  }>;
  analysisMetadata?: {
    processingTime: number;
    transcriptLength: number;
    criteriaCount: number;
    analysisTimestamp: string;
  };
  createdAt?: string;
}

export interface CreateScorecardDto {
  name: string;
  description?: string;
  status?: 'active' | 'inactive' | 'draft';
  passingThreshold?: number;
  scoringAlgorithm?: 'weighted_average' | 'simple_average' | 'minimum_all' | 'pass_fail';
  tags?: string[];
}

export interface UpdateScorecardDto extends Partial<CreateScorecardDto> {}

export interface ListScorecardsParams {
  page?: number;
  limit?: number;
  status?: string;
}

export interface ListScorecardsResponse {
  scorecards: Scorecard[];
  total: number;
  pagination?: Pagination;
}

export interface ScorecardDefaultResponse {
  scorecard: Scorecard;
  source: string;
}

export interface EvaluateRequest {
  transcript: string;
  callId?: string;
  executionId?: string;
}

export interface CreateScorecardResultDto {
  scorecardId: string;
  callId?: string;
  executionId?: string;
  overallScore?: number;
  status?: string;
  categoryScores?: Array<{
    categoryId: string;
    score: number;
    passed: boolean;
  }>;
  criteriaScores?: Array<{
    criteriaId: string;
    score: number;
    passed: boolean;
    feedback?: string;
  }>;
}

// ============================================================================
// TOOL FIXTURES
// ============================================================================

export interface ToolFixture {
  id: string;
  name: string;
  description: string;
  parameters?: Record<string, any>;
  mockResponses?: Array<{
    when?: Record<string, any>;
    isDefault?: boolean;
    return: any;
    description?: string;
  }>;
  tags?: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateToolFixtureDto {
  name: string;
  description: string;
  parameters?: Record<string, any>;
  mockResponses?: Array<{
    when?: Record<string, any>;
    isDefault?: boolean;
    return: any;
    description?: string;
  }>;
  tags?: string[];
  isActive?: boolean;
}

export interface UpdateToolFixtureDto extends Partial<CreateToolFixtureDto> {}

export interface ListToolFixturesParams {
  isActive?: boolean;
  tags?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ListToolFixturesResponse {
  toolFixtures: ToolFixture[];
  total: number;
  pagination?: Pagination;
}

export interface ToolFixtureStats {
  total: number;
  active: number;
  inactive: number;
  byTag: Record<string, number>;
}

// ============================================================================
// SETTINGS
// ============================================================================

export interface Settings {
  id: string;
  providerKeys: {
    openai?: string;
    anthropic?: string;
    http?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateSettingsDto {
  providerKeys?: Record<string, string>;
}

// ============================================================================
// CHAT
// ============================================================================

export interface ChatSession {
  sessionId: string;
  executionId: string;
}

export interface ChatRequest {
  promptId: string;
}

export interface ChatResponse {
  content: string;
  latencyMs?: number;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
    result?: any;
  }>;
}

// ============================================================================
// CLIENT CONFIG
// ============================================================================

export interface EvalClientConfig {
  /** Base URL of the chanl-eval server (e.g., 'http://localhost:18005') */
  baseUrl: string;
  /** API key when the server has CHANL_EVAL_REQUIRE_API_KEY=true */
  apiKey?: string;
}
