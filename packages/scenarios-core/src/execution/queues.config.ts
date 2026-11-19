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
 * Per-server execution throughput. One server serves one user, so the limit protects the
 * provider rate limit rather than sharing capacity: a reliability run of 5 personas x 5 runs
 * queues 25 conversations at once, and 10/minute made that take minutes before any ran.
 */
export interface ExecutionQueueLimits {
  /** Conversations run at the same time. */
  concurrency: number;
  /** Conversations started per minute. */
  maxPerMinute: number;
}

export const DEFAULT_EXECUTION_QUEUE_LIMITS: ExecutionQueueLimits = {
  concurrency: 5,
  maxPerMinute: 60,
};

/**
 * Optional injection token: the host application supplies limits from its own configuration.
 * Without it the defaults above apply.
 */
export const EXECUTION_QUEUE_LIMITS = Symbol('EXECUTION_QUEUE_LIMITS');

/**
 * Default maximum turns for a conversation loop.
 */
export const DEFAULT_MAX_TURNS = 10;
