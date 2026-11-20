import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SIMULATION_CONFIG_PROVIDER } from '@chanl/scenarios-core';
import { SettingsModule } from './settings.module';
import { SettingsService } from './settings.service';
import { createSimulationConfigProvider } from './simulation-config.factory';

/**
 * Global so the execution worker and the scenarios module can resolve the token from inside
 * scenarios-core. Provided on AppModule alone, it was invisible to them and their @Optional()
 * injection silently fell back to nothing (no stored keys, no pinned judge model).
 */
@Global()
@Module({
  imports: [SettingsModule],
  providers: [
    {
      provide: SIMULATION_CONFIG_PROVIDER,
      inject: [SettingsService, ConfigService],
      useFactory: createSimulationConfigProvider,
    },
  ],
  exports: [SIMULATION_CONFIG_PROVIDER],
})
export class SimulationConfigModule {}
