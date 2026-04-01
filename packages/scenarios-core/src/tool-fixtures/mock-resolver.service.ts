import { Injectable } from '@nestjs/common';
import { ToolFixture, MockResponseRule } from './schemas/tool-fixture.schema';

export interface ResolveResult {
  found: boolean;
  result: any;
}

export interface ResolvedToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  result: any;
}

@Injectable()
export class MockResolver {
  /**
   * Given a tool call and a list of tool fixtures, find the matching fixture
   * and resolve the mock response.
   *
   * Resolution order:
   * 1. Find fixture by exact name match
   * 2. Iterate mockResponses in order:
   *    a. If rule has `when`: check if EVERY key in `when` matches the
   *       corresponding key in toolCall.arguments (simple equality,
   *       JSON.stringify for objects)
   *    b. First matching `when` rule wins
   * 3. If no `when` matches, use the first `isDefault: true` rule
   * 4. If no default, return a generic error
   * 5. If tool name not found in fixtures, return { found: false }
   */
  resolve(
    toolCall: { name: string; arguments: Record<string, any> },
    toolFixtures: ToolFixture[],
  ): ResolveResult {
    const fixture = toolFixtures.find((f) => f.name === toolCall.name);

    if (!fixture) {
      return {
        found: false,
        result: { error: `Unknown tool: ${toolCall.name}` },
      };
    }

    const rules = fixture.mockResponses ?? [];

    // First pass: find a matching `when` rule
    for (const rule of rules) {
      if (rule.when && !rule.isDefault) {
        if (this.matchesWhen(rule.when, toolCall.arguments)) {
          return { found: true, result: rule.return };
        }
      }
    }

    // Second pass: find the default rule
    const defaultRule = rules.find((r) => r.isDefault === true);
    if (defaultRule) {
      return { found: true, result: defaultRule.return };
    }

    // Fixture exists but no matching rule
    return {
      found: true,
      result: {
        error: 'No mock response configured for these arguments',
      },
    };
  }

  /**
   * Resolve all tool calls in a batch.
   */
  resolveAll(
    toolCalls: Array<{
      id: string;
      name: string;
      arguments: Record<string, any>;
    }>,
    toolFixtures: ToolFixture[],
  ): ResolvedToolCall[] {
    return toolCalls.map((tc) => {
      const { result } = this.resolve(tc, toolFixtures);
      return {
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
        result,
      };
    });
  }

  /**
   * Check if every key in `when` matches the corresponding key in `args`.
   * Uses simple equality for primitives, JSON.stringify for objects/arrays.
   * Keys in `args` that are not in `when` are ignored (partial match).
   * An empty `when` ({}) matches everything (vacuous truth).
   */
  private matchesWhen(
    when: Record<string, any>,
    args: Record<string, any>,
  ): boolean {
    for (const key of Object.keys(when)) {
      const expected = when[key];
      const actual = args[key];

      if (typeof expected === 'object' && expected !== null) {
        if (JSON.stringify(expected) !== JSON.stringify(actual)) {
          return false;
        }
      } else {
        if (expected !== actual) {
          return false;
        }
      }
    }
    return true;
  }
}
