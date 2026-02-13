/**
 * Queue configuration for scenario execution.
 */

/**
 * Queue name constants.
 */
export const QUEUE_NAMES = {
  SCENARIO_EXECUTION: 'scenario-execution',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/**
 * Default job options for the scenario-execution queue.
 */
export const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000, // 1s, 2s, 4s
  },
  removeOnComplete: {
    age: 24 * 3600, // 24 hours
    count: 1000,
  },
  removeOnFail: {
    age: 7 * 24 * 3600, // 7 days
  },
};

/**
 * Worker/concurrency settings per queue.
 */
export const workerOptions: Record<
  QueueName,
  { concurrency: number; maxPerMinute: number }
> = {
  [QUEUE_NAMES.SCENARIO_EXECUTION]: {
    concurrency: 5,
    maxPerMinute: 10,
  },
};

/**
 * Default maximum turns for a conversation loop.
 */
export const DEFAULT_MAX_TURNS = 10;
