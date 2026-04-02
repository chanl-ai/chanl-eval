import type { ExecuteScenarioDto } from '@chanl/eval-sdk';

/**
 * Build the execute payload for a scenario run.
 * The only agent config source is the Prompt entity identified by promptId.
 * API keys come from server-side Settings — never sent from the client.
 */
export function buildExecutePayload(
  promptId: string,
  extra?: Partial<Omit<ExecuteScenarioDto, 'promptId'>>,
): ExecuteScenarioDto {
  return {
    promptId,
    mode: 'text',
    ...extra,
  };
}
