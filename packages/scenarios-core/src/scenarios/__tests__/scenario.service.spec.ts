import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as yaml from 'js-yaml';
import { ScenarioService } from '../services/scenario.service';
import {
  Scenario,
  ScenarioSchema,
  ScenarioDocument,
} from '../schemas/scenario.schema';
import {
  ScenarioExecution,
  ScenarioExecutionSchema,
  ScenarioExecutionDocument,
} from '../schemas/scenario-execution.schema';
import {
  Persona,
  PersonaSchema,
  PersonaDocument,
} from '../../personas/schemas/persona.schema';

// The scenario service returns toJSON() results which have `id` added
// by the virtual ID plugin, but TypeScript does not know about it.
// We use this helper type for readable assertions.
type ScenarioJson = Scenario & { id: string };

describe('ScenarioService', () => {
  let service: ScenarioService;
  let scenarioModel: Model<ScenarioDocument>;
  let executionModel: Model<ScenarioExecutionDocument>;
  let personaModel: Model<PersonaDocument>;
  let mongod: MongoMemoryServer;
  let module: TestingModule;

  let personaId1: string;
  let personaId2: string;

  const agentId1 = new Types.ObjectId().toString();
  const agentId2 = new Types.ObjectId().toString();

  const validScenarioData = {
    name: 'Customer Support Test',
    description: 'Test customer support agent handling complaints',
    prompt: 'You are a frustrated customer calling about a broken product.',
    category: 'support',
    difficulty: 'medium' as const,
    tags: ['support', 'complaint'],
    personaIds: [] as string[],
    agentIds: [agentId1],
  };

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: Scenario.name, schema: ScenarioSchema },
          { name: ScenarioExecution.name, schema: ScenarioExecutionSchema },
          { name: Persona.name, schema: PersonaSchema },
        ]),
      ],
      providers: [ScenarioService],
    }).compile();

    service = module.get<ScenarioService>(ScenarioService);
    scenarioModel = module.get<Model<ScenarioDocument>>(getModelToken(Scenario.name));
    executionModel = module.get<Model<ScenarioExecutionDocument>>(getModelToken(ScenarioExecution.name));
    personaModel = module.get<Model<PersonaDocument>>(getModelToken(Persona.name));

    const persona1 = await personaModel.create({
      name: 'Test Persona 1', gender: 'female', emotion: 'friendly', language: 'english',
      accent: 'american', intentClarity: 'very clear', speechStyle: 'normal',
      backgroundNoise: false, allowInterruptions: true, createdBy: 'test',
      tags: [], isActive: true, isDefault: false, variables: {},
    });
    const persona2 = await personaModel.create({
      name: 'Test Persona 2', gender: 'male', emotion: 'frustrated', language: 'english',
      accent: 'british', intentClarity: 'slightly unclear', speechStyle: 'fast',
      backgroundNoise: true, allowInterruptions: false, createdBy: 'test',
      tags: [], isActive: true, isDefault: false, variables: {},
    });

    personaId1 = persona1._id.toString();
    personaId2 = persona2._id.toString();
    validScenarioData.personaIds = [personaId1];
  });

  afterAll(async () => { await module.close(); await mongod.stop(); });
  afterEach(async () => { await scenarioModel.deleteMany({}); await executionModel.deleteMany({}); });

  function json(scenario: Scenario): ScenarioJson {
    return scenario as unknown as ScenarioJson;
  }

  describe('create()', () => {
    it('should create a scenario with all fields', async () => {
      const result = json(await service.create(validScenarioData, 'user1'));
      expect(result.id).toBeDefined();
      expect(result.name).toBe('Customer Support Test');
      expect(result.category).toBe('support');
      expect(result.difficulty).toBe('medium');
      expect(result.status).toBe('active');
      expect(result.tags).toEqual(['support', 'complaint']);
      expect(result.createdBy).toBe('user1');
      expect(result.personaIds).toHaveLength(1);
      expect(result.agentIds).toHaveLength(1);
    });

    it('should create a scenario without createdBy (OSS mode)', async () => {
      const result = json(await service.create(validScenarioData));
      expect(result.id).toBeDefined();
      expect(result.name).toBe('Customer Support Test');
    });

    it('should create a draft scenario with placeholder ObjectIds', async () => {
      const placeholderId = new Types.ObjectId().toString();
      const result = json(await service.create({
        ...validScenarioData, status: 'draft',
        personaIds: [placeholderId], agentIds: [placeholderId],
      }, 'user1'));
      expect(result.status).toBe('draft');
    });

    it('should throw when non-draft has no personaIds', async () => {
      await expect(service.create({ ...validScenarioData, personaIds: [] }, 'user1'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw when non-draft has no agentIds', async () => {
      await expect(service.create({ ...validScenarioData, agentIds: [] }, 'user1'))
        .rejects.toThrow(BadRequestException);
    });

    it('should default status to active', async () => {
      const result = json(await service.create(validScenarioData));
      expect(result.status).toBe('active');
    });

    it('should set default metrics', async () => {
      const result = json(await service.create(validScenarioData));
      expect(result.metrics).toBeDefined();
      expect(result.metrics.totalExecutions).toBe(0);
      expect(result.metrics.successfulExecutions).toBe(0);
      expect(result.metrics.averageScore).toBe(0);
    });
  });

  describe('findOne()', () => {
    it('should find a scenario by ID', async () => {
      const created = json(await service.create(validScenarioData, 'user1'));
      const found = json(await service.findOne(created.id));
      expect(found.id).toBe(created.id);
      expect(found.name).toBe('Customer Support Test');
    });

    it('should throw NotFoundException when not found', async () => {
      await expect(service.findOne('507f1f77bcf86cd799439011')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll()', () => {
    it('should return paginated list', async () => {
      await service.create(validScenarioData);
      await service.create({ ...validScenarioData, name: 'Second Scenario' });
      const result = await service.findAll();
      expect(result.scenarios.length).toBe(2);
      expect(result.total).toBe(2);
    });

    it('should filter by status', async () => {
      await service.create(validScenarioData);
      await service.create({ ...validScenarioData, name: 'Draft', status: 'draft', personaIds: [personaId1], agentIds: [agentId1] });
      const result = await service.findAll({ status: 'active' });
      expect(result.scenarios.length).toBe(1);
      expect(json(result.scenarios[0]).name).toBe('Customer Support Test');
    });

    it('should filter by category', async () => {
      await service.create(validScenarioData);
      await service.create({ ...validScenarioData, name: 'Sales', category: 'sales' });
      const result = await service.findAll({ category: 'support' });
      expect(result.scenarios.length).toBe(1);
    });

    it('should filter by tags', async () => {
      await service.create({ ...validScenarioData, tags: ['urgent', 'vip'] });
      await service.create({ ...validScenarioData, name: 'Other', tags: ['general'] });
      const result = await service.findAll({ tags: ['urgent'] });
      expect(result.scenarios.length).toBe(1);
    });

    it('should return all when no filters', async () => {
      await service.create(validScenarioData);
      await service.create({ ...validScenarioData, name: 'Another' });
      const result = await service.findAll();
      expect(result.scenarios.length).toBe(2);
      expect(result.total).toBe(2);
    });

    it('should apply pagination', async () => {
      for (let i = 0; i < 5; i++) await service.create({ ...validScenarioData, name: `S${i}` });
      const result = await service.findAll(undefined, { limit: 2, offset: 0 });
      expect(result.scenarios.length).toBe(2);
      expect(result.total).toBe(5);
    });

    it('should apply pagination with offset', async () => {
      for (let i = 0; i < 5; i++) await service.create({ ...validScenarioData, name: `S${i}` });
      const result = await service.findAll(undefined, { limit: 2, offset: 3 });
      expect(result.scenarios.length).toBe(2);
      expect(result.total).toBe(5);
    });
  });

  describe('update()', () => {
    it('should update fields', async () => {
      const created = json(await service.create(validScenarioData, 'user1'));
      const updated = json(await service.update(created.id, { name: 'Updated', description: 'Updated desc' }));
      expect(updated.name).toBe('Updated');
      expect(updated.description).toBe('Updated desc');
    });

    it('should throw NotFoundException for non-existent scenario', async () => {
      await expect(service.update('507f1f77bcf86cd799439011', { name: 'No One' })).rejects.toThrow(NotFoundException);
    });

    it('should update tags', async () => {
      const created = json(await service.create(validScenarioData));
      const updated = json(await service.update(created.id, { tags: ['new-tag', 'another'] }));
      expect(updated.tags).toEqual(['new-tag', 'another']);
    });

    it('should update category', async () => {
      const created = json(await service.create(validScenarioData));
      const updated = json(await service.update(created.id, { category: 'sales' }));
      expect(updated.category).toBe('sales');
    });
  });

  describe('remove()', () => {
    it('should archive a scenario', async () => {
      const created = json(await service.create(validScenarioData));
      await service.remove(created.id);
      const archived = json(await service.findOne(created.id));
      expect(archived.status).toBe('archived');
    });

    it('should throw NotFoundException for non-existent', async () => {
      await expect(service.remove('507f1f77bcf86cd799439011')).rejects.toThrow(NotFoundException);
    });
  });

  describe('publish()', () => {
    it('should change draft to active', async () => {
      const created = json(await service.create({ ...validScenarioData, status: 'draft' }));
      const result = await service.publish(created.id);
      expect(json(result.scenario).status).toBe('active');
      expect(result.previousStatus).toBe('draft');
    });

    it('should change paused to active', async () => {
      const created = json(await service.create(validScenarioData));
      await service.unpublish(created.id);
      const result = await service.publish(created.id);
      expect(json(result.scenario).status).toBe('active');
      expect(result.previousStatus).toBe('paused');
    });

    it('should fail with missing prompt', async () => {
      const created = json(await service.create({ ...validScenarioData, status: 'draft' }));
      await scenarioModel.findByIdAndUpdate(created.id, { prompt: '' });
      await expect(service.publish(created.id)).rejects.toThrow(BadRequestException);
    });

    it('should validate personas with personaLookup', async () => {
      const created = json(await service.create({ ...validScenarioData, status: 'draft' }));
      const lookupSuccess = async (_id: string) => ({ id: _id, name: 'found' });
      const result = await service.publish(created.id, lookupSuccess);
      expect(json(result.scenario).status).toBe('active');
    });

    it('should fail when personaLookup reports missing', async () => {
      const created = json(await service.create({ ...validScenarioData, status: 'draft' }));
      const lookupFail = async () => { throw new NotFoundException('Not found'); };
      await expect(service.publish(created.id, lookupFail)).rejects.toThrow(BadRequestException);
    });
  });

  describe('unpublish()', () => {
    it('should change active to paused', async () => {
      const created = json(await service.create(validScenarioData));
      const result = await service.unpublish(created.id);
      expect(json(result.scenario).status).toBe('paused');
      expect(result.previousStatus).toBe('active');
    });
  });

  describe('full lifecycle', () => {
    it('draft -> active -> paused -> archived', async () => {
      const draft = json(await service.create({ ...validScenarioData, status: 'draft' }));
      expect(draft.status).toBe('draft');
      const published = await service.publish(draft.id);
      expect(json(published.scenario).status).toBe('active');
      const paused = await service.unpublish(draft.id);
      expect(json(paused.scenario).status).toBe('paused');
      await service.remove(draft.id);
      const archived = json(await service.findOne(draft.id));
      expect(archived.status).toBe('archived');
    });
  });

  describe('clone()', () => {
    it('should create copy with (Clone) suffix', async () => {
      const original = json(await service.create(validScenarioData, 'user1'));
      const cloned = json(await service.clone(original.id, 'user2'));
      expect(cloned.id).not.toBe(original.id);
      expect(cloned.name).toBe('Customer Support Test (Clone)');
      expect(cloned.status).toBe('draft');
      expect(cloned.createdBy).toBe('user2');
    });

    it('should allow custom name', async () => {
      const original = json(await service.create(validScenarioData));
      const cloned = json(await service.clone(original.id, 'user2', 'My Custom Clone'));
      expect(cloned.name).toBe('My Custom Clone');
    });

    it('should reset metrics', async () => {
      const original = json(await service.create(validScenarioData));
      const cloned = json(await service.clone(original.id));
      expect(cloned.metrics.totalExecutions).toBe(0);
    });

    it('should set parentScenarioId', async () => {
      const original = json(await service.create(validScenarioData));
      const cloned = json(await service.clone(original.id));
      expect(cloned.parentScenarioId!.toString()).toBe(original.id);
    });
  });

  describe('validate()', () => {
    it('should return valid for complete scenario', async () => {
      const created = json(await service.create({ ...validScenarioData, description: 'Has desc', tags: ['has-tag'] }));
      const result = await service.validate(created.id);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should error on missing prompt', async () => {
      const created = json(await service.create({ ...validScenarioData, status: 'draft' }));
      await scenarioModel.findByIdAndUpdate(created.id, { prompt: '' });
      const result = await service.validate(created.id);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Prompt is required');
    });

    it('should error on missing personaIds', async () => {
      const created = json(await service.create({ ...validScenarioData, status: 'draft' }));
      await scenarioModel.findByIdAndUpdate(created.id, { personaIds: [] });
      const result = await service.validate(created.id);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one persona is required');
    });

    it('should error on missing agentIds', async () => {
      const created = json(await service.create({ ...validScenarioData, status: 'draft' }));
      await scenarioModel.findByIdAndUpdate(created.id, { agentIds: [] });
      const result = await service.validate(created.id);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one agent is required');
    });

    it('should warn on missing description', async () => {
      const created = json(await service.create({ ...validScenarioData, description: undefined }));
      const result = await service.validate(created.id);
      expect(result.warnings).toContain('No description provided');
    });

    it('should warn on missing tags', async () => {
      const created = json(await service.create({ ...validScenarioData, tags: [] }));
      const result = await service.validate(created.id);
      expect(result.warnings).toContain('No tags provided');
    });

    it('should validate persona refs with personaLookup', async () => {
      const fakeId = new Types.ObjectId().toString();
      const created = json(await service.create({ ...validScenarioData, status: 'draft', personaIds: [fakeId], agentIds: [agentId1] }));
      const lookupFail = async () => { throw new NotFoundException('Not found'); };
      const result = await service.validate(created.id, lookupFail);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('not found'))).toBe(true);
    });
  });

  describe('fromYaml()', () => {
    it('should create from valid YAML', async () => {
      const yamlStr = `
name: YAML Scenario
description: Imported from YAML
prompt: You are a test persona
category: support
difficulty: easy
tags: [yaml, import]
personaIds: [${personaId1}]
agentIds: [${agentId1}]
`;
      const result = json(await service.fromYaml(yamlStr, 'yaml-user'));
      expect(result.id).toBeDefined();
      expect(result.name).toBe('YAML Scenario');
      expect(result.createdBy).toBe('yaml-user');
    });

    it('should throw on invalid YAML', async () => {
      await expect(service.fromYaml('not: valid: yaml: [[[', 'user')).rejects.toThrow();
    });
  });

  describe('toYaml()', () => {
    it('should export to valid YAML', async () => {
      const created = json(await service.create({ ...validScenarioData, description: 'Export test', tags: ['export'] }, 'user1'));
      const yamlStr = service.toYaml(created);
      const parsed = yaml.load(yamlStr) as Record<string, any>;
      expect(parsed.name).toBe('Customer Support Test');
      expect(parsed.description).toBe('Export test');
      expect(parsed.tags).toEqual(['export']);
    });

    it('should round-trip via YAML', async () => {
      const original = json(await service.create({ ...validScenarioData, description: 'Round trip', tags: ['rt'] }, 'user1'));
      const yamlStr = service.toYaml(original);
      const reimported = json(await service.fromYaml(yamlStr));
      expect(reimported.name).toBe(original.name);
      expect(reimported.prompt).toBe(original.prompt);
    });

    it('should include optional fields', async () => {
      const created = json(await service.create({
        ...validScenarioData,
        context: { situation: 'Customer is upset', objective: 'Resolve complaint' },
        simulationMode: 'phone', phoneNumber: '+14155559999',
      }, 'user1'));
      const parsed = yaml.load(service.toYaml(created)) as Record<string, any>;
      expect(parsed.context.situation).toBe('Customer is upset');
      expect(parsed.simulationMode).toBe('phone');
      expect(parsed.phoneNumber).toBe('+14155559999');
    });
  });

  describe('getScenarioStats()', () => {
    it('should return zero stats when empty', async () => {
      const stats = await service.getScenarioStats();
      expect(stats.total).toBe(0);
      expect(stats.totalRuns).toBe(0);
      expect(stats.activeRuns).toBe(0);
    });

    it('should return stats for created scenarios', async () => {
      await service.create(validScenarioData);
      await service.create({ ...validScenarioData, name: 'Second', category: 'sales' });
      const stats = await service.getScenarioStats();
      expect(stats.total).toBe(2);
      expect(stats.byCategory.length).toBeGreaterThan(0);
    });
  });
});
