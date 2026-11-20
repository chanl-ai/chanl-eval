import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_EXECUTION_QUEUE_LIMITS,
  EXECUTION_QUEUE_LIMITS,
  ExecutionQueueLimits,
} from '@chanl/scenarios-core';

/**
 * Global so scenarios-core's queue registration can resolve the token from inside its own module
 * without depending on the server's configuration.
 */
@Global()
@Module({
  providers: [
    {
      provide: EXECUTION_QUEUE_LIMITS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ExecutionQueueLimits => ({
        concurrency: Number(
          config.get<string>('CHANL_EXECUTION_CONCURRENCY') ??
            DEFAULT_EXECUTION_QUEUE_LIMITS.concurrency,
        ),
        maxPerMinute: Number(
          config.get<string>('CHANL_EXECUTION_MAX_PER_MINUTE') ??
            DEFAULT_EXECUTION_QUEUE_LIMITS.maxPerMinute,
        ),
      }),
    },
  ],
  exports: [EXECUTION_QUEUE_LIMITS],
})
export class ExecutionQueueLimitsModule {}
