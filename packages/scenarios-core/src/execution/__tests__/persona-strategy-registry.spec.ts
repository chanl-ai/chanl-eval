import { PersonaStrategyRegistry } from '../persona-strategy-registry';
import { PersonaStrategy, PersonaStrategyContext } from '../persona-strategy.interface';

class MockStrategy implements PersonaStrategy {
  readonly type = 'mock';
  async generateOpening() { return 'Hello'; }
  async generateUtterance() { return 'Next message'; }
}

class AnotherStrategy implements PersonaStrategy {
  readonly type = 'another';
  async generateOpening() { return null; }
  async generateUtterance() { return null; }
  getInternalTools() { return [{ name: 'test_tool', description: 'test', parameters: {} }]; }
}

describe('PersonaStrategyRegistry', () => {
  let registry: PersonaStrategyRegistry;

  beforeEach(() => {
    registry = new PersonaStrategyRegistry();
  });

  describe('register / get', () => {
    it('should register and retrieve a strategy by type', () => {
      const strategy = new MockStrategy();
      registry.register(strategy);
      expect(registry.get('mock')).toBe(strategy);
    });

    it('should return undefined for unregistered type', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('getOrThrow', () => {
    it('should return strategy when registered', () => {
      const strategy = new MockStrategy();
      registry.register(strategy);
      expect(registry.getOrThrow('mock')).toBe(strategy);
    });

    it('should throw with descriptive error for unregistered type', () => {
      registry.register(new MockStrategy());
      expect(() => registry.getOrThrow('nonexistent')).toThrow(
        /No persona strategy registered for type "nonexistent"/,
      );
      expect(() => registry.getOrThrow('nonexistent')).toThrow(/mock/);
    });
  });

  describe('list / listTypes / has', () => {
    it('should list all registered strategies', () => {
      registry.register(new MockStrategy());
      registry.register(new AnotherStrategy());
      expect(registry.list()).toHaveLength(2);
      expect(registry.listTypes()).toEqual(expect.arrayContaining(['mock', 'another']));
    });

    it('should check existence with has()', () => {
      registry.register(new MockStrategy());
      expect(registry.has('mock')).toBe(true);
      expect(registry.has('nope')).toBe(false);
    });
  });

  describe('onModuleInit', () => {
    it('should register default and reactive strategies', () => {
      registry.onModuleInit();
      expect(registry.has('default')).toBe(true);
      expect(registry.has('reactive')).toBe(true);
      expect(registry.listTypes()).toHaveLength(2);
    });
  });
});
