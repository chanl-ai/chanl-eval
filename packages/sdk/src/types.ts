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
  agentIds?: string[];
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
  agentOverrides?: Record<string, {
    promptOverride?: string;
    promptVariables?: Record<string, string>;
    temperature?: number;
    maxTokens?: number;
    tools?: string[];
    voice?: {
      voiceId?: string;
      speed?: number;
      stability?: number;
    };
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
  agentIds: string[];
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
  agentOverrides?: Record<string, {
    promptOverride?: string;
    promptVariables?: Record<string, string>;
    temperature?: number;
    maxTokens?: number;
    tools?: string[];
    voice?: {
      voiceId?: string;
      speed?: number;
      stability?: number;
    };
  }>;
}

export interface UpdateScenarioDto extends Partial<CreateScenarioDto> {}

export interface ListScenariosParams {
  agentId?: string;
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
  scenarioId: string;
  agentId?: string;
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
    score?: number;
  }>;
  createdAt?: string;
  updatedAt?: string;
}

export interface ExecuteScenarioDto {
  mode?: 'text' | 'phone';
  phoneNumber?: string;
  agentId?: string;
  personaId?: string;
  scorecardId?: string;
  parameters?: Record<string, any>;
  triggerId?: string;
  environment?: string;
  priority?: number;
  dryRun?: boolean;
}

export interface ListExecutionsParams {
  scenarioId?: string;
  agentId?: string;
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

export interface ScorecardResult {
  id: string;
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
// CLIENT CONFIG
// ============================================================================

export interface EvalClientConfig {
  /** Base URL of the chanl-eval server (e.g., 'http://localhost:18005') */
  baseUrl: string;
  /** API key when the server has CHANL_EVAL_REQUIRE_API_KEY=true */
  apiKey?: string;
}
