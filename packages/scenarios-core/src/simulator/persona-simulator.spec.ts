import { PersonaSimulatorService, PersonaTraits } from './persona-simulator.service';

describe('PersonaSimulatorService', () => {
  let simulator: PersonaSimulatorService;

  beforeEach(() => {
    simulator = new PersonaSimulatorService();
  });

  describe('toSystemPrompt', () => {
    it('should generate base prompt with scenario goal', () => {
      const persona: PersonaTraits = {
        name: 'Test User',
        emotion: 'neutral',
        speechStyle: 'normal',
        intentClarity: 'very clear',
      };

      const prompt = simulator.toSystemPrompt(persona, 'I need a refund');

      expect(prompt).toContain('simulating a user');
      expect(prompt).toContain('I need a refund');
    });

    it('should map frustrated emotion to aggressive tone', () => {
      const persona: PersonaTraits = {
        name: 'Karen',
        emotion: 'frustrated',
        speechStyle: 'fast',
        intentClarity: 'very clear',
      };

      const prompt = simulator.toSystemPrompt(
        persona,
        'I want a refund for my broken laptop!',
      );

      expect(prompt).toContain('frustrated');
      expect(prompt).toContain('impatient');
      expect(prompt).toContain('dissatisfaction');
    });

    it('should map irritated emotion to confrontational tone', () => {
      const persona: PersonaTraits = {
        name: 'Angry Karen',
        emotion: 'irritated',
        speechStyle: 'normal',
        intentClarity: 'slightly unclear',
      };

      const prompt = simulator.toSystemPrompt(persona, 'Fix my order');

      expect(prompt).toContain('irritated');
      expect(prompt).toContain('confrontational');
    });

    it('should map friendly emotion to warm tone', () => {
      const persona: PersonaTraits = {
        name: 'Sophia',
        emotion: 'friendly',
        speechStyle: 'slow',
        intentClarity: 'very clear',
      };

      const prompt = simulator.toSystemPrompt(
        persona,
        'I have a question about my order',
      );

      expect(prompt).toContain('friendly');
      expect(prompt).toContain('warm');
      expect(prompt).toContain('polite');
    });

    it('should include cooperation level from behavior traits', () => {
      const persona: PersonaTraits = {
        name: 'Difficult Customer',
        emotion: 'annoyed',
        speechStyle: 'fast',
        intentClarity: 'unclear',
        behavior: {
          cooperationLevel: 'difficult',
        },
      };

      const prompt = simulator.toSystemPrompt(persona, 'Where is my order?');

      expect(prompt).toContain('resistant');
      expect(prompt).toContain('Cooperation Level');
    });

    it('should include patience traits', () => {
      const persona: PersonaTraits = {
        name: 'Impatient',
        emotion: 'stressed',
        speechStyle: 'fast',
        intentClarity: 'slightly unclear',
        behavior: {
          patience: 'very impatient',
        },
      };

      const prompt = simulator.toSystemPrompt(persona, 'I need help now');

      expect(prompt).toContain('Patience');
      expect(prompt).toContain('extremely impatient');
      expect(prompt).toContain('immediate');
    });

    it('should include interruption behavior', () => {
      const persona: PersonaTraits = {
        name: 'Interrupter',
        emotion: 'frustrated',
        speechStyle: 'fast',
        intentClarity: 'very clear',
        conversationTraits: {
          interruptionFrequency: 'frequently',
        },
      };

      const prompt = simulator.toSystemPrompt(persona, 'Fix my issue');

      expect(prompt).toContain('Interruption Behavior');
      expect(prompt).toContain('interrupt');
    });

    it('should include backstory when provided', () => {
      const persona: PersonaTraits = {
        name: 'Sarah',
        emotion: 'concerned',
        speechStyle: 'normal',
        intentClarity: 'very clear',
        backstory:
          'Sarah is a busy professional who values efficiency. She recently had a bad shipping experience.',
      };

      const prompt = simulator.toSystemPrompt(persona, 'Check my order status');

      expect(prompt).toContain('Your Background');
      expect(prompt).toContain('busy professional');
    });

    it('should include communication style from behavior', () => {
      const persona: PersonaTraits = {
        name: 'Verbose Customer',
        emotion: 'neutral',
        speechStyle: 'normal',
        intentClarity: 'very clear',
        behavior: {
          communicationStyle: 'verbose',
        },
      };

      const prompt = simulator.toSystemPrompt(persona, 'I need help');

      expect(prompt).toContain('lots of detail');
    });

    it('should always end with important instruction', () => {
      const persona: PersonaTraits = {
        name: 'Any',
        emotion: 'neutral',
        speechStyle: 'normal',
        intentClarity: 'very clear',
      };

      const prompt = simulator.toSystemPrompt(persona, 'test');

      expect(prompt).toContain('Stay in character');
      expect(prompt).toContain('conversational and realistic');
    });
  });

  describe('getVoiceConfig', () => {
    it('should return male voice config', () => {
      const persona: PersonaTraits = {
        name: 'James',
        emotion: 'calm',
        speechStyle: 'slow',
        intentClarity: 'very clear',
        gender: 'male',
      };

      const config = simulator.getVoiceConfig(persona);

      expect(config.voiceId).toBe('josh');
      expect(config.provider).toBe('elevenlabs');
      expect(config.speed).toBe(0.8);
      expect(config.emotion).toBe('calm');
      expect(config.backgroundNoise).toBe(false);
    });

    it('should return female voice config with background noise', () => {
      const persona: PersonaTraits = {
        name: 'Mei',
        emotion: 'stressed',
        speechStyle: 'fast',
        intentClarity: 'slightly unclear',
        gender: 'female',
        backgroundNoise: true,
      };

      const config = simulator.getVoiceConfig(persona);

      expect(config.voiceId).toBe('rachel');
      expect(config.speed).toBe(1.2);
      expect(config.backgroundNoise).toBe(true);
    });
  });

  describe('shouldInterrupt', () => {
    it('should return false when no interruption frequency', () => {
      const persona: PersonaTraits = {
        name: 'Calm',
        emotion: 'calm',
        speechStyle: 'normal',
        intentClarity: 'very clear',
      };

      expect(simulator.shouldInterrupt(persona)).toBe(false);
    });

    it('should return false when frequency is never', () => {
      const persona: PersonaTraits = {
        name: 'Patient',
        emotion: 'calm',
        speechStyle: 'normal',
        intentClarity: 'very clear',
        conversationTraits: { interruptionFrequency: 'never' },
      };

      expect(simulator.shouldInterrupt(persona)).toBe(false);
    });

    it('should sometimes return true for frequent interrupters', () => {
      const persona: PersonaTraits = {
        name: 'Interrupter',
        emotion: 'frustrated',
        speechStyle: 'fast',
        intentClarity: 'very clear',
        conversationTraits: { interruptionFrequency: 'frequently' },
      };

      // Run multiple times — with 0.8 probability, should get at least one true
      const results = Array.from({ length: 20 }, () =>
        simulator.shouldInterrupt(persona),
      );
      expect(results.some((r) => r === true)).toBe(true);
    });
  });
});
