import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { BootstrapService } from '../bootstrap/bootstrap.service';

// Read version from package.json at startup
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../../package.json');

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly bootstrapService: BootstrapService) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: pkg.version || '0.1.0',
      initialized: true,
      seeded: this.bootstrapService.isSeeded,
    };
  }
}
