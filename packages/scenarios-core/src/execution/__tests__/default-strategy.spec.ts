import { DefaultPersonaStrategy } from '../strategies/default.strategy';
import { PersonaStrategyContext } from '../persona-strategy.interface';

// Mock persona-llm module
jest.mock('../persona-llm', () => ({
  generatePersonaOpening: jest.fn(),
  generatePersonaUtterance: jest.fn(),
  resolvePersonaLlmKey: jest.fn(),
}));

import { generatePersonaOpening, generatePersonaUtterance } from '../persona-llm';

const mockOpening = generatePersonaOpening as jest.MockedFunction<typeof generatePersonaOpening>;
const mockUtterance = generatePersonaUtterance as jest.MockedFunction<typeof generatePersonaUtterance>;

function makeCtx(overrides?: Partial<PersonaStrategyContext>): PersonaStrategyContext {
  return {
    personaTraits: { name: 'Test Customer' },
    systemPrompt: 'You are a frustrated customer.',
    history: [],
    lastAgentResponse: 'How can I help you?',
    turn: 0,
    transcript: [],
    scenarioPrompt: 'Customer wants a refund',
    adapterType: 'openai',
    adapterConfig: { apiKey: 'sk-test' },
    ...overrides,
  };
}

describe('DefaultPersonaStrategy', () => {
  const strategy = new DefaultPersonaStrategy();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have type "default"', () => {
    expect(strategy.type).toBe('default');
  });

  describe('generateOpening', () => {
    it('should delegate to generatePersonaOpening', async () => {
      mockOpening.mockResolvedValue('Hi, I need help with my order.');
      const result = await strategy.generateOpening(makeCtx());
      expect(result).toBe('Hi, I need help with my order.');
      expect(mockOpening).toHaveBeenCalledWith({
        personaSystemPrompt: 'You are a frustrated customer.',
        scenarioPrompt: 'Customer wants a refund',
        adapterType: 'openai',
        adapterConfig: { apiKey: 'sk-test' },
      });
    });

    it('should return null when persona LLM returns null', async () => {
      mockOpening.mockResolvedValue(null);
      expect(await strategy.generateOpening(makeCtx())).toBeNull();
    });
  });

  describe('generateUtterance', () => {
    it('should delegate to generatePersonaUtterance', async () => {
      mockUtterance.mockResolvedValue('That is not acceptable.');
      const result = await strategy.generateUtterance(makeCtx());
      expect(result).toBe('That is not acceptable.');
      expect(mockUtterance).toHaveBeenCalledWith({
        personaSystemPrompt: 'You are a frustrated customer.',
        history: [],
        adapterType: 'openai',
        adapterConfig: { apiKey: 'sk-test' },
      });
    });
  });

  it('should NOT have getInternalTools', () => {
    expect((strategy as any).getInternalTools).toBeUndefined();
  });

  it('should NOT have updateSystemPrompt', () => {
    expect((strategy as any).updateSystemPrompt).toBeUndefined();
  });
});
