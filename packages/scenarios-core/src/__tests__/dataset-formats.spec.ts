import { stepResultsToConversation } from '../dataset/convert';
import { toOpenAIChat, toOpenAIChatJsonl } from '../dataset/formats/openai';
import { toShareGPT, toShareGPTJsonl } from '../dataset/formats/sharegpt';
import { toDPO, toDPOJsonl } from '../dataset/formats/dpo';
import type { StepResult } from '../scenarios/schemas/scenario-execution.schema';
import type { ConversationRecord, ConversationMetadata } from '../dataset/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseMeta: ConversationMetadata = {
  executionId: 'exec_test-001',
  scenarioId: 'scenario-123',
  personaId: 'persona-456',
  score: 85,
  turnCount: 3,
  duration: 12000,
  tags: ['support', 'refund'],
  scenarioName: 'Angry Refund',
  personaName: 'Frustrated Customer',
};

/** Simple 3-turn conversation without tool calls */
const simpleStepResults: StepResult[] = [
  {
    stepId: 'turn-0-persona',
    status: 'completed',
    role: 'persona',
    actualResponse: 'I was charged twice for my subscription and I want a refund.',
    duration: 0,
  },
  {
    stepId: 'turn-0-agent',
    status: 'completed',
    role: 'agent',
    actualResponse: "I'm sorry to hear that. Let me look into your account right away.",
    duration: 1250,
  },
  {
    stepId: 'turn-1-persona',
    status: 'completed',
    role: 'persona',
    actualResponse: "This is unacceptable. It's been three days!",
    duration: 0,
  },
  {
    stepId: 'turn-1-agent',
    status: 'completed',
    role: 'agent',
    actualResponse: "I completely understand your frustration. I've processed a full refund of $29.99 to your card.",
    duration: 980,
  },
  {
    stepId: 'turn-2-persona',
    status: 'completed',
    role: 'persona',
    actualResponse: 'Thank you. How long will the refund take?',
    duration: 0,
  },
  {
    stepId: 'turn-2-agent',
    status: 'completed',
    role: 'agent',
    actualResponse: "You'll see it within 3-5 business days. Is there anything else I can help with?",
    duration: 870,
  },
];

/** Conversation with tool calls */
const toolStepResults: StepResult[] = [
  {
    stepId: 'turn-0-persona',
    status: 'completed',
    role: 'persona',
    actualResponse: 'Cancel my order ORD-4521.',
    duration: 0,
  },
  {
    stepId: 'turn-0-tool-0',
    status: 'completed',
    role: 'tool',
    actualResponse: JSON.stringify({ name: 'lookup_order', arguments: { order_id: 'ORD-4521' }, result: { status: 'active', total: 59.99 } }),
    duration: 200,
    toolCalls: [{
      name: 'lookup_order',
      arguments: { order_id: 'ORD-4521' },
      result: { status: 'active', total: 59.99 },
    }],
  },
  {
    stepId: 'turn-0-agent',
    status: 'completed',
    role: 'agent',
    actualResponse: "I've found order ORD-4521. Your $59.99 order has been cancelled and a refund will be processed.",
    duration: 1100,
  },
];

const toolDefs = [
  {
    name: 'lookup_order',
    description: 'Look up an order by ID',
    parameters: { type: 'object', properties: { order_id: { type: 'string' } }, required: ['order_id'] },
  },
];

// ---------------------------------------------------------------------------
// stepResultsToConversation
// ---------------------------------------------------------------------------

describe('stepResultsToConversation', () => {
  it('converts simple conversation', () => {
    const record = stepResultsToConversation(simpleStepResults, {
      systemPrompt: 'You are a helpful support agent.',
      metadata: baseMeta,
    });

    expect(record.systemPrompt).toBe('You are a helpful support agent.');
    expect(record.messages).toHaveLength(6);
    expect(record.messages[0]).toEqual({ role: 'user', content: expect.stringContaining('charged twice') });
    expect(record.messages[1]).toEqual({ role: 'assistant', content: expect.stringContaining('look into your account') });
    expect(record.metadata.executionId).toBe('exec_test-001');
  });

  it('maps persona → user and agent → assistant', () => {
    const record = stepResultsToConversation(simpleStepResults, { metadata: baseMeta });

    for (const msg of record.messages) {
      expect(['user', 'assistant']).toContain(msg.role);
    }

    // Alternating user/assistant
    expect(record.messages[0].role).toBe('user');
    expect(record.messages[1].role).toBe('assistant');
    expect(record.messages[2].role).toBe('user');
    expect(record.messages[3].role).toBe('assistant');
  });

  it('converts tool calls into assistant+tool message pairs', () => {
    const record = stepResultsToConversation(toolStepResults, {
      systemPrompt: 'You are a support agent.',
      tools: toolDefs,
      metadata: baseMeta,
    });

    // user, assistant (tool_call), tool (result), assistant (final text)
    expect(record.messages).toHaveLength(4);
    expect(record.messages[0].role).toBe('user');
    expect(record.messages[1].role).toBe('assistant');
    expect(record.messages[1].toolCalls).toHaveLength(1);
    expect(record.messages[1].toolCalls![0].name).toBe('lookup_order');
    expect(record.messages[2].role).toBe('tool');
    expect(record.messages[2].toolCallId).toBeDefined();
    expect(record.messages[3].role).toBe('assistant');
    expect(record.messages[3].content).toContain('cancelled');
  });

  it('skips steps with no content', () => {
    const steps: StepResult[] = [
      { stepId: 'empty', status: 'completed', role: 'persona', actualResponse: '' },
      { stepId: 'real', status: 'completed', role: 'persona', actualResponse: 'Hello' },
    ];
    const record = stepResultsToConversation(steps, { metadata: baseMeta });
    expect(record.messages).toHaveLength(1);
    expect(record.messages[0].content).toBe('Hello');
  });
});

// ---------------------------------------------------------------------------
// OpenAI format
// ---------------------------------------------------------------------------

describe('toOpenAIChat', () => {
  let simpleRecord: ConversationRecord;

  beforeEach(() => {
    simpleRecord = stepResultsToConversation(simpleStepResults, {
      systemPrompt: 'You are a helpful support agent.',
      metadata: baseMeta,
    });
  });

  it('produces valid OpenAI chat format', () => {
    const line = toOpenAIChat(simpleRecord);

    expect(line.messages[0]).toEqual({ role: 'system', content: 'You are a helpful support agent.' });
    expect(line.messages[1]).toEqual({ role: 'user', content: expect.any(String) });
    expect(line.messages[2]).toEqual({ role: 'assistant', content: expect.any(String) });
  });

  it('each JSONL line is valid JSON', () => {
    const jsonl = toOpenAIChatJsonl(simpleRecord);
    const parsed = JSON.parse(jsonl);
    expect(parsed.messages).toBeDefined();
    expect(Array.isArray(parsed.messages)).toBe(true);
  });

  it('omits system prompt when overridden with null', () => {
    const line = toOpenAIChat(simpleRecord, { systemPrompt: null });
    expect(line.messages[0].role).toBe('user'); // no system message
  });

  it('overrides system prompt', () => {
    const line = toOpenAIChat(simpleRecord, { systemPrompt: 'Custom prompt.' });
    expect(line.messages[0]).toEqual({ role: 'system', content: 'Custom prompt.' });
  });

  it('includes tool calls when includeTools=true', () => {
    const toolRecord = stepResultsToConversation(toolStepResults, {
      systemPrompt: 'Agent prompt.',
      tools: toolDefs,
      metadata: baseMeta,
    });

    const line = toOpenAIChat(toolRecord, { includeTools: true });

    // Should have tools definition
    expect(line.tools).toBeDefined();
    expect(line.tools![0].function.name).toBe('lookup_order');

    // Should have assistant message with tool_calls
    const toolCallMsg = line.messages.find((m) => m.tool_calls?.length);
    expect(toolCallMsg).toBeDefined();
    expect(toolCallMsg!.tool_calls![0].function.name).toBe('lookup_order');

    // CRITICAL: arguments must be a JSON STRING, not object
    expect(typeof toolCallMsg!.tool_calls![0].function.arguments).toBe('string');
    const parsedArgs = JSON.parse(toolCallMsg!.tool_calls![0].function.arguments);
    expect(parsedArgs.order_id).toBe('ORD-4521');

    // Should have tool result message
    const toolResultMsg = line.messages.find((m) => m.role === 'tool');
    expect(toolResultMsg).toBeDefined();
    expect(toolResultMsg!.tool_call_id).toBeDefined();
  });

  it('strips tool calls when includeTools=false', () => {
    const toolRecord = stepResultsToConversation(toolStepResults, {
      systemPrompt: 'Agent prompt.',
      tools: toolDefs,
      metadata: baseMeta,
    });

    const line = toOpenAIChat(toolRecord, { includeTools: false });

    // No tool_calls or tool roles
    expect(line.tools).toBeUndefined();
    expect(line.messages.every((m) => !m.tool_calls)).toBe(true);
    expect(line.messages.every((m) => m.role !== 'tool')).toBe(true);
  });

  it('produces no empty messages', () => {
    const line = toOpenAIChat(simpleRecord);
    for (const msg of line.messages) {
      expect(msg.content || msg.tool_calls?.length).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// ShareGPT format
// ---------------------------------------------------------------------------

describe('toShareGPT', () => {
  let simpleRecord: ConversationRecord;

  beforeEach(() => {
    simpleRecord = stepResultsToConversation(simpleStepResults, {
      systemPrompt: 'You are a helpful support agent.',
      metadata: baseMeta,
    });
  });

  it('produces valid ShareGPT format', () => {
    const line = toShareGPT(simpleRecord);

    expect(line.conversations[0]).toEqual({ from: 'system', value: 'You are a helpful support agent.' });
    expect(line.conversations[1]).toEqual({ from: 'human', value: expect.any(String) });
    expect(line.conversations[2]).toEqual({ from: 'gpt', value: expect.any(String) });
  });

  it('uses human/gpt roles', () => {
    const line = toShareGPT(simpleRecord);
    const roles = line.conversations.map((c) => c.from);
    expect(roles).toEqual(['system', 'human', 'gpt', 'human', 'gpt', 'human', 'gpt']);
  });

  it('each JSONL line is valid JSON', () => {
    const jsonl = toShareGPTJsonl(simpleRecord);
    const parsed = JSON.parse(jsonl);
    expect(parsed.conversations).toBeDefined();
    expect(Array.isArray(parsed.conversations)).toBe(true);
  });

  it('omits system prompt when overridden with null', () => {
    const line = toShareGPT(simpleRecord, { systemPrompt: null });
    expect(line.conversations[0].from).toBe('human');
  });

  it('inlines tool calls when toolHandling=inline', () => {
    const toolRecord = stepResultsToConversation(toolStepResults, {
      tools: toolDefs,
      metadata: baseMeta,
    });

    const line = toShareGPT(toolRecord, { toolHandling: 'inline' });

    const toolMsg = line.conversations.find((c) => c.from === 'gpt' && c.value.includes('[Tool Call:'));
    expect(toolMsg).toBeDefined();
    expect(toolMsg!.value).toContain('lookup_order');
  });

  it('omits tool calls by default', () => {
    const toolRecord = stepResultsToConversation(toolStepResults, {
      tools: toolDefs,
      metadata: baseMeta,
    });

    const line = toShareGPT(toolRecord);
    const hasToolCall = line.conversations.some((c) => c.value.includes('[Tool Call:'));
    expect(hasToolCall).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DPO format
// ---------------------------------------------------------------------------

describe('toDPO', () => {
  const highScoreRecord: ConversationRecord = {
    messages: [
      { role: 'user', content: 'I need a refund.' },
      { role: 'assistant', content: "I understand your frustration. I've processed a full refund immediately." },
      { role: 'user', content: 'How long will it take?' },
      { role: 'assistant', content: "3-5 business days. I've also added a 10% discount for your next order." },
    ],
    systemPrompt: 'You are a support agent.',
    metadata: { ...baseMeta, score: 95, executionId: 'exec_high' },
  };

  const lowScoreRecord: ConversationRecord = {
    messages: [
      { role: 'user', content: 'I need a refund.' },
      { role: 'assistant', content: 'Please check our refund policy on the website.' },
      { role: 'user', content: 'How long will it take?' },
      { role: 'assistant', content: 'I cannot provide that information.' },
    ],
    systemPrompt: 'You are a support agent.',
    metadata: { ...baseMeta, score: 30, executionId: 'exec_low' },
  };

  it('creates valid DPO preference pair', () => {
    const line = toDPO(highScoreRecord, lowScoreRecord);

    expect(line).not.toBeNull();
    expect(line!.input.messages).toBeDefined();
    expect(line!.preferred_output.length).toBeGreaterThan(0);
    expect(line!.non_preferred_output.length).toBeGreaterThan(0);
  });

  it('higher-scored conversation is preferred', () => {
    const line = toDPO(highScoreRecord, lowScoreRecord)!;

    expect(line.preferred_output[0].content).toContain('processed a full refund');
    expect(line.non_preferred_output[0].content).toContain('refund policy');
  });

  it('works regardless of argument order', () => {
    const lineAB = toDPO(highScoreRecord, lowScoreRecord)!;
    const lineBA = toDPO(lowScoreRecord, highScoreRecord)!;

    // Both should produce same preferred/non-preferred
    expect(lineAB.preferred_output[0].content).toBe(lineBA.preferred_output[0].content);
    expect(lineAB.non_preferred_output[0].content).toBe(lineBA.non_preferred_output[0].content);
  });

  it('includes system prompt in input', () => {
    const line = toDPO(highScoreRecord, lowScoreRecord)!;
    expect(line.input.messages[0]).toEqual({ role: 'system', content: 'You are a support agent.' });
  });

  it('includes user messages in input', () => {
    const line = toDPO(highScoreRecord, lowScoreRecord)!;
    const userMsgs = line.input.messages.filter((m) => m.role === 'user');
    expect(userMsgs.length).toBeGreaterThan(0);
    expect(userMsgs[0].content).toContain('refund');
  });

  it('returns null when score delta below threshold', () => {
    const almostSame = {
      ...lowScoreRecord,
      metadata: { ...lowScoreRecord.metadata, score: 90 },
    };
    const line = toDPO(highScoreRecord, almostSame, { minScoreDelta: 10 });
    expect(line).toBeNull();
  });

  it('returns pair when score delta meets threshold', () => {
    const line = toDPO(highScoreRecord, lowScoreRecord, { minScoreDelta: 50 });
    expect(line).not.toBeNull();
  });

  it('serializes to valid JSONL', () => {
    const jsonl = toDPOJsonl(highScoreRecord, lowScoreRecord);
    expect(jsonl).not.toBeNull();
    const parsed = JSON.parse(jsonl!);
    expect(parsed.input).toBeDefined();
    expect(parsed.preferred_output).toBeDefined();
    expect(parsed.non_preferred_output).toBeDefined();
  });

  it('returns null JSONL when below threshold', () => {
    const same = { ...lowScoreRecord, metadata: { ...lowScoreRecord.metadata, score: 95 } };
    const jsonl = toDPOJsonl(highScoreRecord, same, { minScoreDelta: 10 });
    expect(jsonl).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cross-format consistency
// ---------------------------------------------------------------------------

describe('cross-format consistency', () => {
  it('all formats produce output from the same input', () => {
    const record = stepResultsToConversation(simpleStepResults, {
      systemPrompt: 'You are a support agent.',
      metadata: baseMeta,
    });

    const openai = toOpenAIChatJsonl(record);
    const sharegpt = toShareGPTJsonl(record);

    // Both should be valid JSON
    expect(() => JSON.parse(openai)).not.toThrow();
    expect(() => JSON.parse(sharegpt)).not.toThrow();

    // Both should contain the same conversation content
    expect(openai).toContain('charged twice');
    expect(sharegpt).toContain('charged twice');
    expect(openai).toContain('processed a full refund');
    expect(sharegpt).toContain('processed a full refund');
  });

  it('metadata is not included in training data', () => {
    const record = stepResultsToConversation(simpleStepResults, {
      systemPrompt: 'Agent prompt.',
      metadata: baseMeta,
    });

    const openai = toOpenAIChatJsonl(record);
    const sharegpt = toShareGPTJsonl(record);

    // No metadata fields in training output
    expect(openai).not.toContain('executionId');
    expect(openai).not.toContain('scenarioId');
    expect(sharegpt).not.toContain('executionId');
    expect(sharegpt).not.toContain('personaTraits');
  });
});
