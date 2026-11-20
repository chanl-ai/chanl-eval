/**
 * Contract check for the bulk seeder.
 *
 * The seeder writes straight to MongoDB, so nothing stops it storing values the API will later
 * reject. That is not hypothetical: seeded scenarios carried categories outside the DTO's allowed
 * set, and the failure only surfaced when a user opened one and pressed save on a form they had not
 * edited.
 *
 * Validating each document against the same DTO the API uses moves that failure to seed time, where
 * it is one line of output instead of an unreproducible bug report.
 */

import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';

export interface SeedValidationError {
  entity: string;
  name: string;
  problems: string[];
}

/**
 * Validate a batch against a DTO class. Returns the failures rather than throwing, so the seeder can
 * report every problem in one pass instead of one per run.
 */
export function validateBatch<T extends object>(
  entity: string,
  dtoClass: new () => T,
  records: Array<Record<string, unknown>>,
): SeedValidationError[] {
  const failures: SeedValidationError[] = [];

  for (const record of records) {
    const instance = plainToInstance(dtoClass, record);
    const errors = validateSync(instance as object, {
      whitelist: false,
      forbidNonWhitelisted: false,
    });

    if (errors.length > 0) {
      failures.push({
        entity,
        name: String(record.name ?? '(unnamed)'),
        problems: errors.flatMap((e) =>
          Object.values(e.constraints ?? { unknown: `${e.property} is invalid` }),
        ),
      });
    }
  }

  return failures;
}

/** Print failures and exit non-zero. Seeding invalid data is worse than not seeding. */
export function reportAndExitOnFailure(failures: SeedValidationError[]): void {
  if (failures.length === 0) return;

  console.error(`\n✗ ${failures.length} seed record(s) would be rejected by the API:\n`);
  for (const f of failures) {
    console.error(`  ${f.entity} "${f.name}"`);
    for (const p of f.problems) console.error(`    - ${p}`);
  }
  console.error(
    '\nFix the seed data or the DTO. Writing these would create records the UI cannot save.\n',
  );
  process.exit(1);
}
