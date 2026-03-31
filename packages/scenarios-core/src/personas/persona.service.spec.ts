import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { NotFoundException } from '@nestjs/common';
import { PersonaService } from './persona.service';
import {
  Persona,
  PersonaSchema,
  PersonaDocument,
} from './schemas/persona.schema';

describe('PersonaService', () => {
  let service: PersonaService;
  let model: Model<PersonaDocument>;
  let mongod: MongoMemoryServer;
  let module: TestingModule;

  const validPersonaData = {
    name: 'Test Persona',
    gender: 'female',
    emotion: 'friendly',
    language: 'english',
    accent: 'american',
    intentClarity: 'very clear',
    speechStyle: 'normal',
    backgroundNoise: false,
    allowInterruptions: true,
    description: 'A test persona',
    tags: ['test'],
  };

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: Persona.name, schema: PersonaSchema },
        ]),
      ],
      providers: [PersonaService],
    }).compile();

    service = module.get<PersonaService>(PersonaService);
    model = module.get<Model<PersonaDocument>>(getModelToken(Persona.name));
  });

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  describe('create()', () => {
    it('should create a persona with all fields and return it with id', async () => {
      const result = await service.create(validPersonaData, 'user1');

      const json = (result as any).toJSON();
      expect(json.id).toBeDefined();
      expect(json.name).toBe('Test Persona');
      expect(json.gender).toBe('female');
      expect(json.emotion).toBe('friendly');
      expect(json.language).toBe('english');
      expect(json.accent).toBe('american');
      expect(json.intentClarity).toBe('very clear');
      expect(json.speechStyle).toBe('normal');
      expect(json.backgroundNoise).toBe(false);
      expect(json.allowInterruptions).toBe(true);
      expect(json.description).toBe('A test persona');
      expect(json.tags).toEqual(['test']);
      expect(json.createdBy).toBe('user1');
      expect(json.isActive).toBe(true);
    });

    it('should create a persona without createdBy (OSS mode)', async () => {
      const result = await service.create(validPersonaData);

      const json = (result as any).toJSON();
      expect(json.id).toBeDefined();
      expect(json.name).toBe('Test Persona');
    });

    it('should create a persona with agentConfig', async () => {
      const dataWithAgent = {
        ...validPersonaData,
        agentConfig: {
          promptTemplate: 'You are {{name}}',
          voice: { voiceId: 'abc', provider: 'elevenlabs' as const },
          behavior: {
            interruptionFrequency: 'frequent' as const,
            responseSpeed: 'fast' as const,
            verbosity: 'verbose' as const,
          },
        },
      };

      const result = await service.create(dataWithAgent);
      const json = (result as any).toJSON();
      expect(json.agentConfig.promptTemplate).toBe('You are {{name}}');
      expect(json.agentConfig.voice.voiceId).toBe('abc');
      expect(json.agentConfig.behavior.interruptionFrequency).toBe('frequent');
    });
  });

  describe('findOne()', () => {
    it('should find a persona by ID', async () => {
      const created = await service.create(validPersonaData);
      const createdJson = (created as any).toJSON();

      const found = await service.findOne(createdJson.id);
      const foundJson = (found as any).toJSON();
      expect(foundJson.id).toBe(createdJson.id);
      expect(foundJson.name).toBe('Test Persona');
    });

    it('should throw NotFoundException when persona not found', async () => {
      await expect(
        service.findOne('507f1f77bcf86cd799439011'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update()', () => {
    it('should update fields and return updated persona', async () => {
      const created = await service.create(validPersonaData, 'user1');
      const createdJson = (created as any).toJSON();

      const updated = await service.update(
        createdJson.id,
        { name: 'Updated Name', emotion: 'calm' },
      );

      const updatedJson = (updated as any).toJSON();
      expect(updatedJson.name).toBe('Updated Name');
      expect(updatedJson.emotion).toBe('calm');
    });

    it('should throw NotFoundException when updating non-existent persona', async () => {
      await expect(
        service.update('507f1f77bcf86cd799439011', { name: 'No One' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update isActive and isDefault', async () => {
      const created = await service.create(validPersonaData);
      const createdJson = (created as any).toJSON();

      const updated = await service.update(createdJson.id, {
        isActive: false,
        isDefault: true,
      });

      const updatedJson = (updated as any).toJSON();
      expect(updatedJson.isActive).toBe(false);
      expect(updatedJson.isDefault).toBe(true);
    });
  });

  describe('findAll()', () => {
    it('should return paginated list', async () => {
      await service.create(validPersonaData);
      await service.create({
        ...validPersonaData,
        name: 'Second Persona',
        emotion: 'calm',
      });

      const result = await service.findAll();
      expect(result.personas.length).toBe(2);
      expect(result.total).toBe(2);
    });

    it('should return all personas when no filters provided', async () => {
      await service.create(validPersonaData);
      await service.create({ ...validPersonaData, name: 'No WS Persona' });

      const result = await service.findAll();
      expect(result.personas.length).toBe(2);
      expect(result.total).toBe(2);
    });

    it('should apply emotion filter', async () => {
      await service.create(validPersonaData);
      await service.create({
        ...validPersonaData,
        name: 'Calm One',
        emotion: 'calm',
      });

      const result = await service.findAll({ emotion: 'calm' });
      expect(result.personas.length).toBe(1);
      expect((result.personas[0] as any).toJSON().name).toBe('Calm One');
    });

    it('should apply gender filter', async () => {
      await service.create(validPersonaData);
      await service.create({
        ...validPersonaData,
        name: 'Male Persona',
        gender: 'male',
      });

      const result = await service.findAll({ gender: 'male' });
      expect(result.personas.length).toBe(1);
    });

    it('should apply tags filter', async () => {
      await service.create({
        ...validPersonaData,
        tags: ['urgent', 'complaint'],
      });
      await service.create({
        ...validPersonaData,
        name: 'Other',
        tags: ['general'],
      });

      const result = await service.findAll({
        tags: ['urgent'],
      });
      expect(result.personas.length).toBe(1);
    });

    it('should apply pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await service.create({
          ...validPersonaData,
          name: `Persona ${i}`,
        });
      }

      const result = await service.findAll(undefined, {
        limit: 2,
        offset: 0,
      });
      expect(result.personas.length).toBe(2);
      expect(result.total).toBe(5);
    });
  });

  describe('remove()', () => {
    it('should delete a persona', async () => {
      const created = await service.create(validPersonaData);
      const createdJson = (created as any).toJSON();

      await service.remove(createdJson.id);

      await expect(service.findOne(createdJson.id)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when deleting non-existent persona', async () => {
      await expect(
        service.remove('507f1f77bcf86cd799439011'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createDefaultPersonas()', () => {
    it('should create 7 default personas', async () => {
      const defaults = await service.createDefaultPersonas('system');
      expect(defaults.length).toBe(7);

      const names = defaults.map((p: any) =>
        p.toJSON ? p.toJSON().name : p.name,
      );
      expect(names).toContain('Angry - Karen');
      expect(names).toContain('Friendly - Sophia');
      expect(names).toContain('Polite - Carlos');
      expect(names).toContain('Stressed - Mei');
      expect(names).toContain('Distracted - Alex');
      expect(names).toContain('Calm - James');
      expect(names).toContain('Curious - Maria');
    });

    it('should return existing defaults if already created (idempotent)', async () => {
      const first = await service.createDefaultPersonas('system');
      expect(first.length).toBe(7);

      const second = await service.createDefaultPersonas('system');
      expect(second.length).toBe(7);

      // Total count should still be 7, not 14
      const all = await service.findAll();
      expect(all.total).toBe(7);
    });

    it('should set all defaults as isDefault=true and isActive=true', async () => {
      const defaults = await service.createDefaultPersonas('system');

      for (const p of defaults) {
        const json = (p as any).toJSON ? (p as any).toJSON() : p;
        expect(json.isDefault).toBe(true);
        expect(json.isActive).toBe(true);
      }
    });
  });

  describe('getDefaultPersonas()', () => {
    it('should return only default personas', async () => {
      await service.createDefaultPersonas('system');
      await service.create(validPersonaData);

      const defaults = await service.getDefaultPersonas();
      expect(defaults.length).toBe(7);

      for (const p of defaults) {
        const json = (p as any).toJSON ? (p as any).toJSON() : p;
        expect(json.isDefault).toBe(true);
      }
    });
  });

  describe('getPersonaStats()', () => {
    it('should return stats for all personas', async () => {
      await service.createDefaultPersonas('system');

      const stats = await service.getPersonaStats();
      expect(stats.totalPersonas).toBe(7);
      expect(stats.total).toBe(7);
      expect(stats.activePersonas).toBe(7);
      expect(stats.active).toBe(7);
      expect(stats.defaultPersonas).toBe(7);
      expect(stats.defaults).toBe(7);
      expect(stats.languages).toBeGreaterThanOrEqual(1);
      expect(stats.byEmotion.length).toBe(7);
      expect(stats.byLanguage.length).toBe(7);
      expect(stats.byGender.length).toBe(7);
      expect(stats.byAccent.length).toBe(7);
    });

    it('should return zero stats when no personas exist', async () => {
      const stats = await service.getPersonaStats();
      expect(stats.totalPersonas).toBe(0);
      expect(stats.total).toBe(0);
      expect(stats.active).toBe(0);
      expect(stats.defaults).toBe(0);
    });

    it('should count background noise and interruptions', async () => {
      await service.create({
        ...validPersonaData,
        name: 'Noisy',
        backgroundNoise: true,
        allowInterruptions: true,
      });
      await service.create({
        ...validPersonaData,
        name: 'Quiet',
        backgroundNoise: false,
        allowInterruptions: false,
      });

      const stats = await service.getPersonaStats();
      expect(stats.withBackgroundNoise).toBe(1);
      expect(stats.withInterruptions).toBe(1);
    });
  });
});
