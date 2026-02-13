import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '../health/health.controller';
import { BootstrapService } from '../bootstrap/bootstrap.service';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: BootstrapService,
          useValue: { isSeeded: true },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should return status ok', () => {
    const result = controller.check();
    expect(result.status).toBe('ok');
    expect(result.timestamp).toBeDefined();
    expect(result.version).toBeDefined();
    expect(result.initialized).toBe(true);
    expect(result.seeded).toBe(true);
  });

  it('should return a valid ISO timestamp', () => {
    const result = controller.check();
    const date = new Date(result.timestamp);
    expect(date.toISOString()).toBe(result.timestamp);
  });
});
