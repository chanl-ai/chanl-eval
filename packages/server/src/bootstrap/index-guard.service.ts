import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

interface GuardedIndex {
  collection: string;
  /** Field the unique index is built on. */
  field: string;
  /** What breaks, in user terms, if the index is absent. */
  guarantee: string;
  /**
   * Scope of a partial index. Duplicate diagnosis must apply the same filter, otherwise it reports
   * rows the index does not constrain — two user-created scenarios may share a name while two
   * seeded ones may not.
   */
  partialFilter?: Record<string, unknown>;
}

/**
 * Unique indexes that carry a correctness guarantee rather than just a performance one.
 */
const GUARDED: GuardedIndex[] = [
  {
    collection: 'prompts',
    field: 'name',
    guarantee: 'default prompts are seeded idempotently across concurrent boots',
  },
  {
    collection: 'settings',
    field: 'key',
    guarantee: 'exactly one settings document exists, so saved API keys always resolve',
  },
  {
    collection: 'personas',
    field: 'name',
    guarantee: 'default personas are seeded idempotently across concurrent boots',
    partialFilter: { isDefault: true },
  },
  {
    collection: 'scenarios',
    field: 'name',
    guarantee: 'default scenarios are seeded idempotently across concurrent boots',
    partialFilter: { createdBy: 'system' },
  },
  {
    collection: 'scorecards',
    field: 'name',
    guarantee: 'default scorecards are seeded idempotently across concurrent boots',
    partialFilter: { createdBy: 'system' },
  },
  {
    collection: 'scorecard_categories',
    field: 'name',
    guarantee:
      'a partially built default scorecard tree can be completed without duplicating categories',
  },
  {
    collection: 'scorecard_criteria',
    field: 'key',
    guarantee:
      'a partially built default scorecard tree can be completed without duplicating criteria',
  },
];

/**
 * Verifies that correctness-bearing unique indexes actually exist, and says so loudly when they
 * do not.
 *
 * These indexes were added to collections that previously had no such constraint. On an install
 * that already contains duplicates the build fails, and Mongoose's default behaviour is to log the
 * error and carry on — so the application keeps running with an upsert that has quietly lost its
 * concurrency guarantee, and nothing in the product surfaces it.
 *
 * A guarantee nobody verifies is a guarantee nobody has. This makes the failure loud and names the
 * duplicates that need resolving.
 */
@Injectable()
export class IndexGuardService {
  private readonly logger = new Logger(IndexGuardService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  /**
   * Wait for Mongoose to finish building indexes.
   *
   * `Model.init()` resolves once the model's index builds complete and rejects if one fails, which
   * is precisely the condition this service reports. Without awaiting it, verification races the
   * build and reports absent indexes that appear moments later.
   */
  private async awaitIndexBuilds(): Promise<void> {
    const models = Object.values(this.connection.models);

    await Promise.all(
      models.map(async (model) => {
        try {
          await model.init();
        } catch (error: any) {
          this.logger.error(
            `Index build failed for ${model.modelName}: ${error?.message}`,
          );
        }
      }),
    );
  }

  /** Returns the indexes that are missing, after logging each one. */
  async verify(): Promise<string[]> {
    await this.awaitIndexBuilds();

    const missing: string[] = [];

    for (const guard of GUARDED) {
      try {
        const collection = this.connection.collection(guard.collection);
        const indexes = await collection.indexes();
        const present = indexes.some(
          (i) => i.unique === true && i.key && guard.field in i.key,
        );

        if (present) continue;

        missing.push(`${guard.collection}.${guard.field}`);

        const duplicates = await collection
          .aggregate([
            ...(guard.partialFilter ? [{ $match: guard.partialFilter }] : []),
            { $group: { _id: `$${guard.field}`, n: { $sum: 1 } } },
            { $match: { n: { $gt: 1 } } },
          ])
          .toArray();

        this.logger.error(
          `Missing unique index ${guard.collection}.${guard.field} — ${guard.guarantee} is NOT enforced.`,
        );
        if (duplicates.length > 0) {
          this.logger.error(
            `  Cause: ${duplicates.length} duplicate value(s) block the index build: ` +
              duplicates.map((d) => `"${d._id}" x${d.n}`).join(', '),
          );
          this.logger.error(
            '  Resolve the duplicates and restart; the index will build automatically.',
          );
        }
      } catch (error: any) {
        // A collection that does not exist yet is not a problem — it will be created with its index.
        if (error?.codeName === 'NamespaceNotFound' || error?.code === 26) continue;
        this.logger.warn(
          `Could not verify index on ${guard.collection}: ${error?.message}`,
        );
      }
    }

    if (missing.length === 0) {
      this.logger.log(`Verified ${GUARDED.length} correctness-bearing unique indexes`);
    }
    return missing;
  }
}
