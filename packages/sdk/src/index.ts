/**
 * @chanl/eval-sdk
 *
 * TypeScript SDK for the chanl-eval server.
 */

export { EvalClient, unwrapResponse } from './client';
export { PromptsModule } from './modules/prompts';
export { ScenariosModule } from './modules/scenarios';
export { PersonasModule } from './modules/personas';
export { ScorecardsModule } from './modules/scorecards';
export { ExecutionsModule } from './modules/executions';
export {
  EvalApiError,
  EvalAuthError,
  EvalNotFoundError,
  EvalTimeoutError,
} from './errors';
export type {
  // Config
  EvalClientConfig,
  // Pagination
  Pagination,
  PaginatedResponse,
  // Prompts
  Prompt,
  CreatePromptDto,
  UpdatePromptDto,
  ListPromptsParams,
  ListPromptsResponse,
  // Scenarios
  Scenario,
  CreateScenarioDto,
  UpdateScenarioDto,
  ListScenariosParams,
  ListScenariosResponse,
  // Executions
  Execution,
  ExecuteScenarioDto,
  ListExecutionsParams,
  ListExecutionsResponse,
  WaitForCompletionOptions,
  // Personas
  Persona,
  CreatePersonaDto,
  UpdatePersonaDto,
  ListPersonasParams,
  ListPersonasResponse,
  // Scorecards
  Scorecard,
  ScorecardCategory,
  ScorecardCriteria,
  ScorecardResult,
  CreateScorecardDto,
  UpdateScorecardDto,
  ListScorecardsParams,
  ListScorecardsResponse,
  ScorecardDefaultResponse,
  EvaluateRequest,
  CreateScorecardResultDto,
} from './types';
