import { MockResolver } from '../mock-resolver.service';
import { ToolFixture, MockResponseRule } from '../schemas/tool-fixture.schema';

/**
 * Helper to create a minimal ToolFixture for testing.
 * Only name and mockResponses matter for MockResolver.
 */
function createFixture(
  name: string,
  mockResponses: MockResponseRule[],
): ToolFixture {
  return {
    name,
    description: `Mock ${name}`,
    parameters: { type: 'object', properties: {} },
    mockResponses,
    tags: [],
    isActive: true,
    createdBy: 'test',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ToolFixture;
}

describe('MockResolver', () => {
  let resolver: MockResolver;

  beforeEach(() => {
    resolver = new MockResolver();
  });

  describe('resolve', () => {
    it('should return correct mock for exact match on single argument', () => {
      const fixtures = [
        createFixture('check_order', [
          {
            when: { order_id: 'ORD-123' },
            return: { status: 'shipped' },
          },
          {
            when: { order_id: 'ORD-456' },
            return: { status: 'cancelled' },
          },
        ]),
      ];

      const result = resolver.resolve(
        { name: 'check_order', arguments: { order_id: 'ORD-123' } },
        fixtures,
      );

      expect(result.found).toBe(true);
      expect(result.result).toEqual({ status: 'shipped' });
    });

    it('should match when ALL keys in when match (multiple keys)', () => {
      const fixtures = [
        createFixture('lookup_user', [
          {
            when: { email: 'alice@test.com', role: 'admin' },
            return: { name: 'Alice', permissions: ['read', 'write', 'delete'] },
          },
          {
            when: { email: 'alice@test.com', role: 'viewer' },
            return: { name: 'Alice', permissions: ['read'] },
          },
        ]),
      ];

      const result = resolver.resolve(
        {
          name: 'lookup_user',
          arguments: { email: 'alice@test.com', role: 'admin', extra: true },
        },
        fixtures,
      );

      expect(result.found).toBe(true);
      expect(result.result).toEqual({
        name: 'Alice',
        permissions: ['read', 'write', 'delete'],
      });
    });

    it('should NOT match when some keys match but not all (partial mismatch)', () => {
      const fixtures = [
        createFixture('lookup_user', [
          {
            when: { email: 'alice@test.com', role: 'admin' },
            return: { name: 'Alice' },
          },
          { isDefault: true, return: { name: 'Unknown' } },
        ]),
      ];

      // email matches but role does not
      const result = resolver.resolve(
        {
          name: 'lookup_user',
          arguments: { email: 'alice@test.com', role: 'viewer' },
        },
        fixtures,
      );

      expect(result.found).toBe(true);
      expect(result.result).toEqual({ name: 'Unknown' }); // falls through to default
    });

    it('should return the first matching rule when multiple rules match', () => {
      const fixtures = [
        createFixture('get_status', [
          {
            when: { id: '1' },
            return: { status: 'first-match' },
          },
          {
            when: { id: '1' },
            return: { status: 'second-match' },
          },
        ]),
      ];

      const result = resolver.resolve(
        { name: 'get_status', arguments: { id: '1' } },
        fixtures,
      );

      expect(result.found).toBe(true);
      expect(result.result).toEqual({ status: 'first-match' });
    });

    it('should use default fallback when no when rules match', () => {
      const fixtures = [
        createFixture('check_order', [
          {
            when: { order_id: 'ORD-123' },
            return: { status: 'shipped' },
          },
          {
            isDefault: true,
            return: { status: 'not_found' },
          },
        ]),
      ];

      const result = resolver.resolve(
        { name: 'check_order', arguments: { order_id: 'ORD-999' } },
        fixtures,
      );

      expect(result.found).toBe(true);
      expect(result.result).toEqual({ status: 'not_found' });
    });

    it('should return generic error when no default is configured', () => {
      const fixtures = [
        createFixture('check_order', [
          {
            when: { order_id: 'ORD-123' },
            return: { status: 'shipped' },
          },
          // No isDefault rule
        ]),
      ];

      const result = resolver.resolve(
        { name: 'check_order', arguments: { order_id: 'ORD-999' } },
        fixtures,
      );

      expect(result.found).toBe(true);
      expect(result.result).toEqual({
        error: 'No mock response configured for these arguments',
      });
    });

    it('should return found: false for unknown tool name', () => {
      const fixtures = [
        createFixture('check_order', [
          { isDefault: true, return: { status: 'ok' } },
        ]),
      ];

      const result = resolver.resolve(
        { name: 'nonexistent_tool', arguments: {} },
        fixtures,
      );

      expect(result.found).toBe(false);
      expect(result.result).toEqual({ error: 'Unknown tool: nonexistent_tool' });
    });

    it('should match when when is empty object (vacuous truth)', () => {
      const fixtures = [
        createFixture('ping', [
          {
            when: {},
            return: { pong: true },
          },
        ]),
      ];

      const result = resolver.resolve(
        { name: 'ping', arguments: { anything: 'whatever' } },
        fixtures,
      );

      expect(result.found).toBe(true);
      expect(result.result).toEqual({ pong: true });
    });

    it('should match object values using deep equality', () => {
      const fixtures = [
        createFixture('search', [
          {
            when: { filters: { category: 'electronics', inStock: true } },
            return: { results: ['laptop', 'phone'] },
          },
          { isDefault: true, return: { results: [] } },
        ]),
      ];

      const result = resolver.resolve(
        {
          name: 'search',
          arguments: {
            filters: { category: 'electronics', inStock: true },
          },
        },
        fixtures,
      );

      expect(result.found).toBe(true);
      expect(result.result).toEqual({ results: ['laptop', 'phone'] });
    });

    it('should NOT match object values when they differ', () => {
      const fixtures = [
        createFixture('search', [
          {
            when: { filters: { category: 'electronics' } },
            return: { results: ['laptop'] },
          },
          { isDefault: true, return: { results: [] } },
        ]),
      ];

      const result = resolver.resolve(
        {
          name: 'search',
          arguments: {
            filters: { category: 'clothing' },
          },
        },
        fixtures,
      );

      expect(result.found).toBe(true);
      expect(result.result).toEqual({ results: [] }); // falls to default
    });

    it('should handle fixture with empty mockResponses array', () => {
      const fixtures = [createFixture('empty_tool', [])];

      const result = resolver.resolve(
        { name: 'empty_tool', arguments: {} },
        fixtures,
      );

      expect(result.found).toBe(true);
      expect(result.result).toEqual({
        error: 'No mock response configured for these arguments',
      });
    });

    it('should skip isDefault rules during when-matching pass', () => {
      // A rule with both `when` and `isDefault` is ambiguous.
      // The default should only be used as fallback, not as a when-match.
      const fixtures = [
        createFixture('tool', [
          {
            when: { key: 'specific' },
            return: { match: 'specific' },
          },
          {
            isDefault: true,
            return: { match: 'default' },
          },
        ]),
      ];

      // Should NOT match the default via when-matching, should fall through
      const result = resolver.resolve(
        { name: 'tool', arguments: { key: 'other' } },
        fixtures,
      );

      expect(result.found).toBe(true);
      expect(result.result).toEqual({ match: 'default' });
    });
  });

  describe('resolveAll', () => {
    it('should resolve multiple tool calls correctly', () => {
      const fixtures = [
        createFixture('check_order', [
          {
            when: { order_id: 'ORD-123' },
            return: { status: 'shipped' },
          },
          { isDefault: true, return: { status: 'not_found' } },
        ]),
        createFixture('get_weather', [
          {
            when: { city: 'NYC' },
            return: { temp: 72 },
          },
        ]),
      ];

      const toolCalls = [
        { id: 'tc-1', name: 'check_order', arguments: { order_id: 'ORD-123' } },
        { id: 'tc-2', name: 'get_weather', arguments: { city: 'NYC' } },
        { id: 'tc-3', name: 'unknown_tool', arguments: {} },
      ];

      const results = resolver.resolveAll(toolCalls, fixtures);

      expect(results).toHaveLength(3);

      // First: exact match
      expect(results[0]).toEqual({
        id: 'tc-1',
        name: 'check_order',
        arguments: { order_id: 'ORD-123' },
        result: { status: 'shipped' },
      });

      // Second: exact match
      expect(results[1]).toEqual({
        id: 'tc-2',
        name: 'get_weather',
        arguments: { city: 'NYC' },
        result: { temp: 72 },
      });

      // Third: unknown tool
      expect(results[2]).toEqual({
        id: 'tc-3',
        name: 'unknown_tool',
        arguments: {},
        result: { error: 'Unknown tool: unknown_tool' },
      });
    });

    it('should handle empty tool calls array', () => {
      const results = resolver.resolveAll([], []);
      expect(results).toEqual([]);
    });
  });
});
