import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateScenarioDto } from '../dto/create-scenario.dto';

/**
 * Read-modify-write must not reject its own data.
 *
 * The edit UI loads an entity, sends the same object back, and expects it to validate. When a DTO
 * constrains a field more tightly than storage does, any pre-existing value outside that constraint
 * becomes unsaveable — pressing save with no edits fails. The failure is invisible until someone
 * opens an older record, and it cannot be reproduced by creating a fresh one through the API.
 */
describe('scenario round-trip validation', () => {
  const base = {
    name: 'Add a Teen Driver',
    prompt: 'Customer wants to add their teenage child to an auto policy.',
    personaIds: ['6a2d7cbe7fb1995162a84300'],
    status: 'active',
    difficulty: 'easy',
  };

  async function errorsFor(overrides: Record<string, unknown>) {
    const dto = plainToInstance(CreateScenarioDto, { ...base, ...overrides });
    return validate(dto);
  }

  // Values the application actually writes. Every one of these existed in seeded data while the DTO
  // rejected it.
  it.each([
    'service',
    'claims',
    'billing',
    'retention',
    'support',
    'sales',
  ])('accepts category "%s" on save', async (category) => {
    const errors = await errorsFor({ category });
    const categoryErrors = errors.filter((e) => e.property === 'category');
    expect(categoryErrors).toHaveLength(0);
  });

  it('still rejects a category that is not a string', async () => {
    const errors = await errorsFor({ category: 42 });
    expect(errors.some((e) => e.property === 'category')).toBe(true);
  });

  it('rejects an unbounded category', async () => {
    const errors = await errorsFor({ category: 'x'.repeat(65) });
    expect(errors.some((e) => e.property === 'category')).toBe(true);
  });

  it('keeps genuinely closed vocabularies closed', async () => {
    // difficulty and status describe engine behaviour, not user domain, so they stay enums.
    const bad = await errorsFor({ difficulty: 'trivial' });
    expect(bad.some((e) => e.property === 'difficulty')).toBe(true);

    const good = await errorsFor({ difficulty: 'hard' });
    expect(good.some((e) => e.property === 'difficulty')).toBe(false);
  });
});
