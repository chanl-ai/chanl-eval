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
export { ToolFixturesModule } from './modules/tool-fixtures';
export { SettingsModule } from './modules/settings';
export { ChatModule } from './modules/chat';
export { DatasetsModule } from './modules/datasets';
export type {
  GenerateDatasetOptions,
  GenerateDatasetResponse,
  BatchStatusResponse,
  ExportDatasetOptions,
  ExportPreviewResponse,
} from './modules/datasets';
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
  EvaluateExecutionRequest,
  ScorecardEvaluationResult,
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
  ScorecardCriteriaResult,
  ScorecardResult,
  CreateScorecardDto,
  UpdateScorecardDto,
  ListScorecardsParams,
  ListScorecardsResponse,
  ScorecardDefaultResponse,
  EvaluateRequest,
  CreateScorecardResultDto,
  // Tool Fixtures
  ToolFixture,
  CreateToolFixtureDto,
  UpdateToolFixtureDto,
  ListToolFixturesParams,
  ListToolFixturesResponse,
  ToolFixtureStats,
  // Settings
  Settings,
  UpdateSettingsDto,
  // Chat
  ChatSession,
  ChatRequest,
  ChatResponse,
} from './types';
