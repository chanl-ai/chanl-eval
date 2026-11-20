import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ExecutionProcessor } from './execution-processor';
import { ScenarioExecutionJobData } from './interfaces/job-data.interface';
import {
  DEFAULT_EXECUTION_QUEUE_LIMITS,
  EXECUTION_QUEUE_LIMITS,
  ExecutionQueueLimits,
  QUEUE_NAMES,
} from './queues.config';

/**
 * Attaches ExecutionProcessor to the queue with a configured concurrency. A `@Process` decorator
 * fixes concurrency at compile time (and defaults to 1), so the handler is registered here instead.
 */
@Injectable()
export class ExecutionWorker implements OnModuleInit {
  private readonly logger = new Logger(ExecutionWorker.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.SCENARIO_EXECUTION)
    private readonly queue: Queue<ScenarioExecutionJobData>,
    private readonly processor: ExecutionProcessor,
    @Optional()
    @Inject(EXECUTION_QUEUE_LIMITS)
    private readonly limits?: ExecutionQueueLimits,
  ) {}

  onModuleInit(): void {
    const concurrency = this.limits?.concurrency ?? DEFAULT_EXECUTION_QUEUE_LIMITS.concurrency;
    this.queue.process('execute', concurrency, (job) => this.processor.processExecution(job));
    this.logger.log(
      `Execution worker started: concurrency=${concurrency}, maxPerMinute=${this.limits?.maxPerMinute ?? DEFAULT_EXECUTION_QUEUE_LIMITS.maxPerMinute}`,
    );
  }
}
