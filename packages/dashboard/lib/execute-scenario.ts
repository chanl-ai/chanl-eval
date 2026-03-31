import type { ExecuteScenarioDto } from '@chanl/eval-sdk';
import type { AdapterType } from '@/lib/eval-config';

export function buildExecutePayload(
  adapterType: AdapterType,
  agentApiKey: string,
  extra?: Partial<ExecuteScenarioDto>,
): ExecuteScenarioDto & { adapterType: string; adapterConfig: { apiKey: string } } {
  return {
    mode: 'text',
    ...extra,
    adapterType,
    adapterConfig: { apiKey: agentApiKey },
  };
}
