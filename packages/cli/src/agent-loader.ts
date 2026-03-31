import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

/**
 * Parsed agent definition from a YAML file.
 */
export interface AgentDefinition {
  name: string;
  model: string;
  provider: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
  /** For http provider: the endpoint URL */
  httpEndpoint?: string;
}

/**
 * Raw shape of the agent YAML file before processing.
 */
interface RawAgentYaml {
  name?: string;
  model?: string;
  system_prompt?: string;
  system_prompt_file?: string;
  temperature?: number;
  max_tokens?: number;
}

/**
 * Well-known model prefixes and their providers.
 * Used to auto-detect provider when no explicit prefix is given.
 */
const MODEL_PROVIDER_MAP: Record<string, string> = {
  'gpt-': 'openai',
  'o1': 'openai',
  'o3': 'openai',
  'o4': 'openai',
  'claude-': 'anthropic',
};

/**
 * Parse a model string into provider + model name.
 *
 * Formats:
 *   "gpt-4o"                 -> { provider: "openai", model: "gpt-4o" }
 *   "openai:gpt-4o"          -> { provider: "openai", model: "gpt-4o" }
 *   "anthropic:claude-sonnet" -> { provider: "anthropic", model: "claude-sonnet" }
 *   "http:localhost:8080"     -> { provider: "http", endpoint: "localhost:8080" }
 *   "http:http://my-agent:8080" -> { provider: "http", endpoint: "http://my-agent:8080" }
 */
export function parseModelString(
  modelStr: string,
  fallbackProvider?: string,
): { provider: string; model: string; httpEndpoint?: string } {
  // Check for explicit provider prefix
  const colonIdx = modelStr.indexOf(':');
  if (colonIdx > 0) {
    const prefix = modelStr.slice(0, colonIdx).toLowerCase();

    if (prefix === 'openai') {
      return { provider: 'openai', model: modelStr.slice(colonIdx + 1) };
    }
    if (prefix === 'anthropic') {
      return { provider: 'anthropic', model: modelStr.slice(colonIdx + 1) };
    }
    if (prefix === 'http') {
      const endpoint = modelStr.slice(colonIdx + 1);
      return { provider: 'http', model: '', httpEndpoint: endpoint };
    }
  }

  // Auto-detect from model name
  for (const [prefix, provider] of Object.entries(MODEL_PROVIDER_MAP)) {
    if (modelStr.toLowerCase().startsWith(prefix)) {
      return { provider, model: modelStr };
    }
  }

  // Fall back to config's provider or default to openai
  return { provider: fallbackProvider || 'openai', model: modelStr };
}

/**
 * Load and parse an agent YAML file.
 *
 * @param filePath - Path to the agent YAML file
 * @param fallbackProvider - Provider to use when model string has no prefix and
 *                           auto-detection fails (typically from CLI config)
 * @returns Parsed agent definition
 * @throws Error if file is missing, YAML is invalid, or required fields are absent
 */
export function loadAgentYaml(
  filePath: string,
  fallbackProvider?: string,
): AgentDefinition {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Agent YAML file not found: ${resolvedPath}`);
  }

  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  let parsed: RawAgentYaml;

  try {
    parsed = yaml.load(raw) as RawAgentYaml;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid YAML in agent file ${resolvedPath}: ${message}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(
      `Agent YAML file is empty or not an object: ${resolvedPath}`,
    );
  }

  // Validate required fields
  if (!parsed.name || typeof parsed.name !== 'string') {
    throw new Error(
      `Agent YAML missing required field "name" in ${resolvedPath}`,
    );
  }

  if (!parsed.model || typeof parsed.model !== 'string') {
    throw new Error(
      `Agent YAML missing required field "model" in ${resolvedPath}`,
    );
  }

  // Resolve system prompt: inline or from file
  let systemPrompt: string;

  if (parsed.system_prompt && parsed.system_prompt_file) {
    throw new Error(
      `Agent YAML has both "system_prompt" and "system_prompt_file" — use only one in ${resolvedPath}`,
    );
  }

  if (parsed.system_prompt_file) {
    const promptPath = path.resolve(
      path.dirname(resolvedPath),
      parsed.system_prompt_file,
    );
    if (!fs.existsSync(promptPath)) {
      throw new Error(
        `system_prompt_file not found: ${promptPath} (referenced from ${resolvedPath})`,
      );
    }
    systemPrompt = fs.readFileSync(promptPath, 'utf-8').trim();
  } else if (parsed.system_prompt) {
    systemPrompt = parsed.system_prompt.trim();
  } else {
    throw new Error(
      `Agent YAML missing "system_prompt" or "system_prompt_file" in ${resolvedPath}`,
    );
  }

  if (!systemPrompt) {
    throw new Error(
      `Agent YAML has empty system prompt in ${resolvedPath}`,
    );
  }

  // Parse model string into provider + model
  const { provider, model, httpEndpoint } = parseModelString(
    parsed.model,
    fallbackProvider,
  );

  const result: AgentDefinition = {
    name: parsed.name,
    model,
    provider,
    systemPrompt,
  };

  if (parsed.temperature !== undefined) {
    if (typeof parsed.temperature !== 'number' || parsed.temperature < 0 || parsed.temperature > 2) {
      throw new Error(
        `Agent YAML "temperature" must be a number between 0 and 2 in ${resolvedPath}`,
      );
    }
    result.temperature = parsed.temperature;
  }

  if (parsed.max_tokens !== undefined) {
    if (typeof parsed.max_tokens !== 'number' || parsed.max_tokens < 1) {
      throw new Error(
        `Agent YAML "max_tokens" must be a positive number in ${resolvedPath}`,
      );
    }
    result.maxTokens = parsed.max_tokens;
  }

  if (httpEndpoint) {
    result.httpEndpoint = httpEndpoint;
  }

  return result;
}
