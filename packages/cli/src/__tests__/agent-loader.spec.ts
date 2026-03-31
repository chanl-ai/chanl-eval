import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadAgentYaml, parseModelString } from '../agent-loader';

describe('parseModelString', () => {
  it('detects openai from "gpt-4o" prefix', () => {
    const result = parseModelString('gpt-4o');
    expect(result.provider).toBe('openai');
    expect(result.model).toBe('gpt-4o');
    expect(result.httpEndpoint).toBeUndefined();
  });

  it('detects openai from "o1-preview"', () => {
    const result = parseModelString('o1-preview');
    expect(result.provider).toBe('openai');
    expect(result.model).toBe('o1-preview');
  });

  it('detects anthropic from "claude-sonnet" prefix', () => {
    const result = parseModelString('claude-sonnet-4-20250514');
    expect(result.provider).toBe('anthropic');
    expect(result.model).toBe('claude-sonnet-4-20250514');
  });

  it('parses explicit "openai:gpt-4o" prefix', () => {
    const result = parseModelString('openai:gpt-4o');
    expect(result.provider).toBe('openai');
    expect(result.model).toBe('gpt-4o');
  });

  it('parses explicit "anthropic:claude-sonnet" prefix', () => {
    const result = parseModelString('anthropic:claude-sonnet');
    expect(result.provider).toBe('anthropic');
    expect(result.model).toBe('claude-sonnet');
  });

  it('parses "http:localhost:8080" as http provider', () => {
    const result = parseModelString('http:localhost:8080');
    expect(result.provider).toBe('http');
    expect(result.model).toBe('');
    expect(result.httpEndpoint).toBe('localhost:8080');
  });

  it('parses "http:http://my-agent:8080" as http provider with full URL', () => {
    const result = parseModelString('http:http://my-agent:8080');
    expect(result.provider).toBe('http');
    expect(result.httpEndpoint).toBe('http://my-agent:8080');
  });

  it('uses fallback provider for unknown model names', () => {
    const result = parseModelString('my-custom-model', 'anthropic');
    expect(result.provider).toBe('anthropic');
    expect(result.model).toBe('my-custom-model');
  });

  it('defaults to openai when no fallback provider and unknown model', () => {
    const result = parseModelString('my-custom-model');
    expect(result.provider).toBe('openai');
    expect(result.model).toBe('my-custom-model');
  });
});

describe('loadAgentYaml', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chanl-agent-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  function writeYaml(filename: string, content: string): string {
    const filePath = path.join(tmpDir, filename);
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  it('loads a basic agent YAML with inline system_prompt', () => {
    const filePath = writeYaml(
      'agent.yaml',
      `
name: Support Bot v2
model: gpt-4o
system_prompt: |
  You are a customer support agent.
  Always be polite.
temperature: 0.7
max_tokens: 1024
`,
    );

    const agent = loadAgentYaml(filePath);
    expect(agent.name).toBe('Support Bot v2');
    expect(agent.model).toBe('gpt-4o');
    expect(agent.provider).toBe('openai');
    expect(agent.systemPrompt).toContain('customer support agent');
    expect(agent.systemPrompt).toContain('Always be polite.');
    expect(agent.temperature).toBe(0.7);
    expect(agent.maxTokens).toBe(1024);
  });

  it('loads system_prompt from external file', () => {
    // Create the prompt file
    const promptDir = path.join(tmpDir, 'prompts');
    fs.mkdirSync(promptDir);
    const promptFile = path.join(promptDir, 'support.md');
    fs.writeFileSync(promptFile, 'You are a helpful assistant.\nBe kind.', 'utf-8');

    const filePath = writeYaml(
      'agent.yaml',
      `
name: Bot With File
model: gpt-4o
system_prompt_file: ./prompts/support.md
`,
    );

    const agent = loadAgentYaml(filePath);
    expect(agent.name).toBe('Bot With File');
    expect(agent.systemPrompt).toBe('You are a helpful assistant.\nBe kind.');
  });

  it('resolves system_prompt_file relative to YAML location', () => {
    // Create a subdirectory for the YAML
    const subDir = path.join(tmpDir, 'configs');
    fs.mkdirSync(subDir);

    // Create prompt at tmpDir/prompts/test.md
    const promptDir = path.join(tmpDir, 'prompts');
    fs.mkdirSync(promptDir);
    fs.writeFileSync(path.join(promptDir, 'test.md'), 'Test prompt content', 'utf-8');

    // YAML in subDir references ../prompts/test.md
    const filePath = path.join(subDir, 'agent.yaml');
    fs.writeFileSync(
      filePath,
      `
name: Relative Path Bot
model: gpt-4o
system_prompt_file: ../prompts/test.md
`,
      'utf-8',
    );

    const agent = loadAgentYaml(filePath);
    expect(agent.systemPrompt).toBe('Test prompt content');
  });

  it('detects anthropic provider from model string', () => {
    const filePath = writeYaml(
      'agent.yaml',
      `
name: Claude Bot
model: anthropic:claude-sonnet
system_prompt: You are Claude.
`,
    );

    const agent = loadAgentYaml(filePath);
    expect(agent.provider).toBe('anthropic');
    expect(agent.model).toBe('claude-sonnet');
  });

  it('detects http provider from model string', () => {
    const filePath = writeYaml(
      'agent.yaml',
      `
name: Local Bot
model: http:http://localhost:8080
system_prompt: You are a local bot.
`,
    );

    const agent = loadAgentYaml(filePath);
    expect(agent.provider).toBe('http');
    expect(agent.httpEndpoint).toBe('http://localhost:8080');
    expect(agent.model).toBe('');
  });

  it('uses fallback provider for unknown model names', () => {
    const filePath = writeYaml(
      'agent.yaml',
      `
name: Custom Model Bot
model: my-fine-tuned-model
system_prompt: You are custom.
`,
    );

    const agent = loadAgentYaml(filePath, 'anthropic');
    expect(agent.provider).toBe('anthropic');
    expect(agent.model).toBe('my-fine-tuned-model');
  });

  it('temperature and max_tokens are optional', () => {
    const filePath = writeYaml(
      'agent.yaml',
      `
name: Minimal Bot
model: gpt-4o
system_prompt: You are minimal.
`,
    );

    const agent = loadAgentYaml(filePath);
    expect(agent.temperature).toBeUndefined();
    expect(agent.maxTokens).toBeUndefined();
  });

  // --- Error cases ---

  it('throws if file does not exist', () => {
    expect(() => loadAgentYaml('/nonexistent/agent.yaml')).toThrow(
      'Agent YAML file not found',
    );
  });

  it('throws if YAML is invalid', () => {
    const filePath = writeYaml('bad.yaml', '{{not valid yaml');
    expect(() => loadAgentYaml(filePath)).toThrow('Invalid YAML');
  });

  it('throws if name is missing', () => {
    const filePath = writeYaml(
      'no-name.yaml',
      `
model: gpt-4o
system_prompt: Hello
`,
    );
    expect(() => loadAgentYaml(filePath)).toThrow('missing required field "name"');
  });

  it('throws if model is missing', () => {
    const filePath = writeYaml(
      'no-model.yaml',
      `
name: Bot
system_prompt: Hello
`,
    );
    expect(() => loadAgentYaml(filePath)).toThrow('missing required field "model"');
  });

  it('throws if both system_prompt and system_prompt_file are present', () => {
    const promptDir = path.join(tmpDir, 'prompts');
    fs.mkdirSync(promptDir);
    fs.writeFileSync(path.join(promptDir, 'p.md'), 'Prompt', 'utf-8');

    const filePath = writeYaml(
      'both.yaml',
      `
name: Bot
model: gpt-4o
system_prompt: Inline prompt
system_prompt_file: ./prompts/p.md
`,
    );
    expect(() => loadAgentYaml(filePath)).toThrow(
      'both "system_prompt" and "system_prompt_file"',
    );
  });

  it('throws if neither system_prompt nor system_prompt_file is present', () => {
    const filePath = writeYaml(
      'no-prompt.yaml',
      `
name: Bot
model: gpt-4o
`,
    );
    expect(() => loadAgentYaml(filePath)).toThrow(
      'missing "system_prompt" or "system_prompt_file"',
    );
  });

  it('throws if system_prompt_file references a nonexistent file', () => {
    const filePath = writeYaml(
      'bad-ref.yaml',
      `
name: Bot
model: gpt-4o
system_prompt_file: ./does-not-exist.md
`,
    );
    expect(() => loadAgentYaml(filePath)).toThrow('system_prompt_file not found');
  });

  it('throws if system_prompt is empty string', () => {
    const filePath = writeYaml(
      'empty-prompt.yaml',
      `
name: Bot
model: gpt-4o
system_prompt: "   "
`,
    );
    expect(() => loadAgentYaml(filePath)).toThrow('empty system prompt');
  });

  it('throws if temperature is out of range', () => {
    const filePath = writeYaml(
      'bad-temp.yaml',
      `
name: Bot
model: gpt-4o
system_prompt: Hello
temperature: 3.0
`,
    );
    expect(() => loadAgentYaml(filePath)).toThrow(
      'temperature" must be a number between 0 and 2',
    );
  });

  it('throws if max_tokens is not positive', () => {
    const filePath = writeYaml(
      'bad-tokens.yaml',
      `
name: Bot
model: gpt-4o
system_prompt: Hello
max_tokens: 0
`,
    );
    expect(() => loadAgentYaml(filePath)).toThrow(
      'max_tokens" must be a positive number',
    );
  });

  it('throws if YAML is empty (null parse)', () => {
    const filePath = writeYaml('empty.yaml', '');
    expect(() => loadAgentYaml(filePath)).toThrow('empty or not an object');
  });

  it('throws if YAML parses to a scalar string', () => {
    const filePath = writeYaml('scalar.yaml', 'just a string');
    expect(() => loadAgentYaml(filePath)).toThrow('empty or not an object');
  });
});
