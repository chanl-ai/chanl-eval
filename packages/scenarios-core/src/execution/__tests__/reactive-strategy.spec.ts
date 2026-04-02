import { ReactivePersonaStrategy } from '../strategies/reactive.strategy';

describe('ReactivePersonaStrategy', () => {
  const strategy = new ReactivePersonaStrategy();

  it('should have type "reactive"', () => {
    expect(strategy.type).toBe('reactive');
  });

  describe('getInternalTools', () => {
    it('should return 4 tool definitions', () => {
      const tools = strategy.getInternalTools!();
      expect(tools).toHaveLength(4);
    });

    it('should include analyze_response tool', () => {
      const tools = strategy.getInternalTools!();
      const analyzeResponse = tools.find((t) => t.name === 'analyze_response');
      expect(analyzeResponse).toBeDefined();
      expect(analyzeResponse!.parameters.properties).toHaveProperty('assessment');
      expect(analyzeResponse!.parameters.properties).toHaveProperty('emotional_reaction');
      expect(analyzeResponse!.parameters.required).toContain('assessment');
    });

    it('should include assess_progress tool', () => {
      const tools = strategy.getInternalTools!();
      const assessProgress = tools.find((t) => t.name === 'assess_progress');
      expect(assessProgress).toBeDefined();
      expect(assessProgress!.parameters.properties).toHaveProperty('progress_percentage');
      expect(assessProgress!.parameters.properties).toHaveProperty('next_action');
    });

    it('should include escalate_pressure tool', () => {
      const tools = strategy.getInternalTools!();
      const escalate = tools.find((t) => t.name === 'escalate_pressure');
      expect(escalate).toBeDefined();
      expect(escalate!.parameters.properties).toHaveProperty('escalation_level');
      expect(escalate!.parameters.properties.escalation_level.enum).toContain('demand_supervisor');
    });

    it('should include detect_vulnerability tool', () => {
      const tools = strategy.getInternalTools!();
      const detect = tools.find((t) => t.name === 'detect_vulnerability');
      expect(detect).toBeDefined();
      expect(detect!.parameters.properties).toHaveProperty('vulnerability_type');
      expect(detect!.parameters.properties).toHaveProperty('exploit_strategy');
    });

    it('should have valid JSON Schema parameters for each tool', () => {
      const tools = strategy.getInternalTools!();
      for (const tool of tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.parameters).toBeDefined();
        expect(tool.parameters.type).toBe('object');
        expect(tool.parameters.properties).toBeDefined();
        expect(tool.parameters.required).toBeDefined();
        expect(Array.isArray(tool.parameters.required)).toBe(true);
      }
    });
  });

  describe('generateOpening', () => {
    it('should return null when no API key available', async () => {
      const result = await strategy.generateOpening({
        personaTraits: { name: 'Test' },
        systemPrompt: 'You are a customer.',
        history: [],
        lastAgentResponse: '',
        turn: 0,
        transcript: [],
        scenarioPrompt: 'Customer wants help',
        adapterConfig: {}, // No API key
      });
      expect(result).toBeNull();
    });
  });

  describe('generateUtterance', () => {
    it('should return null when no API key available', async () => {
      const result = await strategy.generateUtterance({
        personaTraits: { name: 'Test' },
        systemPrompt: 'You are a customer.',
        history: [],
        lastAgentResponse: 'How can I help?',
        turn: 1,
        transcript: [],
        scenarioPrompt: 'Customer wants help',
        adapterConfig: {}, // No API key
      });
      expect(result).toBeNull();
    });
  });
});
