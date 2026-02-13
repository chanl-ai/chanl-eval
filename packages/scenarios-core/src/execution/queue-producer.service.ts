import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { QUEUE_NAMES, defaultJobOptions } from './queues.config';
import { ScenarioExecutionJobData } from './interfaces/job-data.interface';

@Injectable()
export class QueueProducerService {
  private readonly logger = new Logger(QueueProducerService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.SCENARIO_EXECUTION)
    private readonly executionQueue: Queue<ScenarioExecutionJobData>,
  ) {}

  /**
   * Enqueue a scenario execution job.
   *
   * @param executionId - The unique execution ID (exec_<uuid>)
   * @param scenarioId - The scenario to execute
   * @param options - Additional job options (adapter, persona, max turns, etc.)
   * @returns The Bull job instance
   */
  async enqueueExecution(
    executionId: string,
    scenarioId: string,
    options?: Partial<
      Omit<ScenarioExecutionJobData, 'executionId' | 'scenarioId'>
    >,
  ) {
    const jobData: ScenarioExecutionJobData = {
      executionId,
      scenarioId,
      ...options,
    };

    const job = await this.executionQueue.add('execute', jobData, {
      ...defaultJobOptions,
      jobId: executionId,
    });

    this.logger.log(
      `Enqueued execution ${executionId} for scenario ${scenarioId} (job ${job.id})`,
    );

    return job;
  }

  /**
   * Get the current count of waiting and active jobs.
   */
  async getQueueCounts() {
    const counts = await this.executionQueue.getJobCounts();
    return counts;
  }
}
