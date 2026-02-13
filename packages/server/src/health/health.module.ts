import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { BootstrapModule } from '../bootstrap/bootstrap.module';

@Module({
  imports: [BootstrapModule],
  controllers: [HealthController],
})
export class HealthModule {}
