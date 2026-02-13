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

  // Helper: valid persona IDs (we create real personas for validation tests)
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
    personaIds: [] as string[], // filled in beforeAll
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
    scenarioModel = module.get<Model<ScenarioDocument>>(
      getModelToken(Scenario.name),
    );
    executionModel = module.get<Model<ScenarioExecutionDocument>>(
      getModelToken(ScenarioExecution.name),
    );
    personaModel = module.get<Model<PersonaDocument>>(
      getModelToken(Persona.name),
    );

    // Create test personas for validation tests
    const persona1 = await personaModel.create({
      name: 'Test Persona 1',
      gender: 'female',
      emotion: 'friendly',
      language: 'english',
      accent: 'american',
      intentClarity: 'very clear',
      speechStyle: 'normal',
      backgroundNoise: false,
      allowInterruptions: true,
      createdBy: 'test',
      tags: [],
      isActive: true,
      isDefault: false,
      variables: {},
    });
    const persona2 = await personaModel.create({
      name: 'Test Persona 2',
      gender: 'male',
      emotion: 'frustrated',
      language: 'english',
      accent: 'british',
      intentClarity: 'slightly unclear',
      speechStyle: 'fast',
      backgroundNoise: true,
      allowInterruptions: false,
      createdBy: 'test',
      tags: [],
      isActive: true,
      isDefault: false,
      variables: {},
    });

    personaId1 = persona1._id.toString();
    personaId2 = persona2._id.toString();
    validScenarioData.personaIds = [personaId1];
  });

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  afterEach(async () => {
    await scenarioModel.deleteMany({});
    await executionModel.deleteMany({});
  });

  /** Cast scenario to include the virtual `id` field. */
  function json(scenario: Scenario): ScenarioJson {
    return scenario as unknown as ScenarioJson;
  }

  // ──────────────── CRUD ────────────────

  describe('create()', () => {
    it('should create a scenario with all fields and return it with id', async () => {
      const result = json(
        await service.create(validScenarioData, undefined, 'user1'),
      );

      expect(result.id).toBeDefined();
      expect(result.name).toBe('Customer Support Test');
      expect(result.description).toBe(
        'Test customer support agent handling complaints',
      );
      expect(result.prompt).toBe(
        'You are a frustrated customer calling about a broken product.',
      );
      expect(result.category).toBe('support');
      expect(result.difficulty).toBe('medium');
      expect(result.status).toBe('active');
      expect(result.tags).toEqual(['support', 'complaint']);
      expect(result.createdBy).toBe('user1');
      expect(result.personaIds).toHaveLength(1);
      expect(result.agentIds).toHaveLength(1);
    });

    it('should create a scenario without workspaceId (OSS mode)', async () => {
      const result = json(await service.create(validScenarioData));

      expect(result.id).toBeDefined();
      expect(result.workspaceId).toBeUndefined();
      expect(result.name).toBe('Customer Support Test');
    });

    it('should create a scenario with workspaceId when provided', async () => {
      const workspaceId = '507f1f77bcf86cd799439011';
      const result = json(
        await service.create(validScenarioData, workspaceId, 'user1'),
      );

      expect(result.id).toBeDefined();
      expect(result.workspaceId!.toString()).toBe(workspaceId);
    });

    it('should create a draft scenario with placeholder ObjectIds', async () => {
      const placeholderId = new Types.ObjectId().toString();
      const draftData = {
        ...validScenarioData,
        status: 'draft',
        personaIds: [placeholderId],
        agentIds: [placeholderId],
      };

      const result = json(
        await service.create(draftData, undefined, 'user1'),
      );
      expect(result.status).toBe('draft');
    });

    it('should throw BadRequestException when non-draft scenario has no personaIds', async () => {
      const invalidData = {
        ...validScenarioData,
        personaIds: [],
      };

      await expect(
        service.create(invalidData, undefined, 'user1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when non-draft scenario has no agentIds', async () => {
      const invalidData = {
        ...validScenarioData,
        agentIds: [],
      };

      await expect(
        service.create(invalidData, undefined, 'user1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should default status to active when not specified', async () => {
      const result = json(await service.create(validScenarioData));
      expect(result.status).toBe('active');
    });

    it('should set default metrics on creation', async () => {
      const result = json(await service.create(validScenarioData));
      expect(result.metrics).toBeDefined();
      expect(result.metrics.totalExecutions).toBe(0);
      expect(result.metrics.successfulExecutions).toBe(0);
      expect(result.metrics.averageScore).toBe(0);
    });
  });

  // ──────────────── findOne ────────────────

  describe('findOne()', () => {
    it('should find a scenario by ID', async () => {
      const created = json(
        await service.create(validScenarioData, undefined, 'user1'),
      );

      const found = json(await service.findOne(created.id));
      expect(found.id).toBe(created.id);
      expect(found.name).toBe('Customer Support Test');
    });

    it('should throw NotFoundException when scenario not found', async () => {
      await expect(
        service.findOne('507f1f77bcf86cd799439011'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should filter by workspaceId when provided', async () => {
      const ws1 = '507f1f77bcf86cd799439011';
      const ws2 = '507f1f77bcf86cd799439022';

      const created = json(
        await service.create(validScenarioData, ws1, 'user1'),
      );

      // Should find with correct workspace
      const found = json(await service.findOne(created.id, ws1));
      expect(found.id).toBe(created.id);

      // Should throw with wrong workspace
      await expect(service.findOne(created.id, ws2)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ──────────────── findAll ────────────────

  describe('findAll()', () => {
    it('should return paginated list', async () => {
      await service.create(validScenarioData);
      await service.create({
        ...validScenarioData,
        name: 'Second Scenario',
      });

      const result = await service.findAll();
      expect(result.scenarios.length).toBe(2);
      expect(result.total).toBe(2);
    });

    it('should filter by status', async () => {
      await service.create(validScenarioData);
      await service.create({
        ...validScenarioData,
        name: 'Draft Scenario',
        status: 'draft',
        personaIds: [personaId1],
        agentIds: [agentId1],
      });

      const result = await service.findAll(undefined, { status: 'active' });
      expect(result.scenarios.length).toBe(1);
      expect(json(result.scenarios[0]).name).toBe('Customer Support Test');
    });

    it('should filter by category', async () => {
      await service.create(validScenarioData);
      await service.create({
        ...validScenarioData,
        name: 'Sales Scenario',
        category: 'sales',
      });

      const result = await service.findAll(undefined, {
        category: 'support',
      });
      expect(result.scenarios.length).toBe(1);
      expect(json(result.scenarios[0]).name).toBe('Customer Support Test');
    });

    it('should filter by tags', async () => {
      await service.create({
        ...validScenarioData,
        tags: ['urgent', 'vip'],
      });
      await service.create({
        ...validScenarioData,
        name: 'Other',
        tags: ['general'],
      });

      const result = await service.findAll(undefined, {
        tags: ['urgent'],
      });
      expect(result.scenarios.length).toBe(1);
    });

    it('should filter by workspaceId', async () => {
      const ws1 = '507f1f77bcf86cd799439011';
      const ws2 = '507f1f77bcf86cd799439022';

      await service.create(validScenarioData, ws1);
      await service.create(
        { ...validScenarioData, name: 'WS2 Scenario' },
        ws2,
      );

      const result = await service.findAll(ws1);
      expect(result.scenarios.length).toBe(1);
      expect(result.total).toBe(1);
    });

    it('should return all scenarios when no workspaceId provided', async () => {
      const ws1 = '507f1f77bcf86cd799439011';
      await service.create(validScenarioData, ws1);
      await service.create({
        ...validScenarioData,
        name: 'No WS Scenario',
      });

      const result = await service.findAll();
      expect(result.scenarios.length).toBe(2);
      expect(result.total).toBe(2);
    });

    it('should apply pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await service.create({
          ...validScenarioData,
          name: `Scenario ${i}`,
        });
      }

      const result = await service.findAll(undefined, undefined, {
        limit: 2,
        offset: 0,
      });
      expect(result.scenarios.length).toBe(2);
      expect(result.total).toBe(5);
    });

    it('should apply pagination with offset', async () => {
      for (let i = 0; i < 5; i++) {
        await service.create({
          ...validScenarioData,
          name: `Scenario ${i}`,
        });
      }

      const result = await service.findAll(undefined, undefined, {
        limit: 2,
        offset: 3,
      });
      expect(result.scenarios.length).toBe(2);
      expect(result.total).toBe(5);
    });
  });

  // ──────────────── update ────────────────

  describe('update()', () => {
    it('should update fields and return updated scenario', async () => {
      const created = json(
        await service.create(validScenarioData, undefined, 'user1'),
      );

      const updated = json(
        await service.update(
          created.id,
          { name: 'Updated Name', description: 'Updated desc' },
          undefined,
          'user2',
        ),
      );

      expect(updated.name).toBe('Updated Name');
      expect(updated.description).toBe('Updated desc');
      expect(updated.lastModifiedBy).toBe('user2');
    });

    it('should throw NotFoundException when updating non-existent scenario', async () => {
      await expect(
        service.update('507f1f77bcf86cd799439011', { name: 'No One' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update tags', async () => {
      const created = json(await service.create(validScenarioData));

      const updated = json(
        await service.update(created.id, {
          tags: ['new-tag', 'another-tag'],
        }),
      );

      expect(updated.tags).toEqual(['new-tag', 'another-tag']);
    });

    it('should update category', async () => {
      const created = json(await service.create(validScenarioData));

      const updated = json(
        await service.update(created.id, { category: 'sales' }),
      );

      expect(updated.category).toBe('sales');
    });
  });

  // ──────────────── remove (archive) ────────────────

  describe('remove()', () => {
    it('should archive a scenario (soft delete)', async () => {
      const created = json(await service.create(validScenarioData));

      await service.remove(created.id);

      const archived = json(await service.findOne(created.id));
      expect(archived.status).toBe('archived');
    });

    it('should throw NotFoundException when removing non-existent scenario', async () => {
      await expect(
        service.remove('507f1f77bcf86cd799439011'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should respect workspaceId when removing', async () => {
      const ws1 = '507f1f77bcf86cd799439011';
      const ws2 = '507f1f77bcf86cd799439022';

      const created = json(
        await service.create(validScenarioData, ws1),
      );

      // Wrong workspace should throw
      await expect(service.remove(created.id, ws2)).rejects.toThrow(
        NotFoundException,
      );

      // Right workspace should succeed
      await service.remove(created.id, ws1);
      const archived = json(await service.findOne(created.id));
      expect(archived.status).toBe('archived');
    });
  });

  // ──────────────── Status Lifecycle ────────────────

  describe('publish()', () => {
    it('should change status from draft to active', async () => {
      const created = json(
        await service.create({
          ...validScenarioData,
          status: 'draft',
        }),
      );

      expect(created.status).toBe('draft');

      const result = await service.publish(
        created.id,
        undefined,
        'user1',
      );

      expect(json(result.scenario).status).toBe('active');
      expect(result.previousStatus).toBe('draft');
    });

    it('should change status from paused to active', async () => {
      const created = json(await service.create(validScenarioData));

      // First unpublish
      const unpublished = await service.unpublish(created.id);
      expect(json(unpublished.scenario).status).toBe('paused');

      // Then re-publish
      const result = await service.publish(created.id);
      expect(json(result.scenario).status).toBe('active');
      expect(result.previousStatus).toBe('paused');
    });

    it('should fail to publish scenario with missing prompt', async () => {
      const created = json(
        await service.create({
          ...validScenarioData,
          status: 'draft',
        }),
      );

      // Manually wipe the prompt via model
      await scenarioModel.findByIdAndUpdate(created.id, {
        prompt: '',
      });

      await expect(
        service.publish(created.id, undefined, 'user1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate personas exist when personaLookup is provided', async () => {
      const created = json(
        await service.create({
          ...validScenarioData,
          status: 'draft',
        }),
      );

      // Lookup function that always finds personas
      const lookupSuccess = async (_id: string) => ({
        id: _id,
        name: 'found',
      });
      const result = await service.publish(
        created.id,
        undefined,
        'user1',
        lookupSuccess,
      );
      expect(json(result.scenario).status).toBe('active');
    });

    it('should fail publish when personaLookup reports missing personas', async () => {
      const created = json(
        await service.create({
          ...validScenarioData,
          status: 'draft',
        }),
      );

      // Lookup function that throws NotFoundException
      const lookupFail = async () => {
        throw new NotFoundException('Not found');
      };

      await expect(
        service.publish(created.id, undefined, 'user1', lookupFail),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('unpublish()', () => {
    it('should change status from active to paused', async () => {
      const created = json(await service.create(validScenarioData));

      expect(created.status).toBe('active');

      const result = await service.unpublish(
        created.id,
        undefined,
        'user1',
      );

      expect(json(result.scenario).status).toBe('paused');
      expect(result.previousStatus).toBe('active');
    });

    it('should set lastModifiedBy', async () => {
      const created = json(await service.create(validScenarioData));

      const result = await service.unpublish(
        created.id,
        undefined,
        'user2',
      );

      expect(json(result.scenario).lastModifiedBy).toBe('user2');
    });
  });

  describe('full lifecycle: draft -> active -> paused -> archived', () => {
    it('should support the full status lifecycle', async () => {
      // 1. Create as draft
      const draft = json(
        await service.create({
          ...validScenarioData,
          status: 'draft',
        }),
      );
      expect(draft.status).toBe('draft');

      // 2. Publish: draft -> active
      const published = await service.publish(draft.id);
      expect(json(published.scenario).status).toBe('active');

      // 3. Unpublish: active -> paused
      const paused = await service.unpublish(draft.id);
      expect(json(paused.scenario).status).toBe('paused');

      // 4. Archive: paused -> archived
      await service.remove(draft.id);
      const archived = json(await service.findOne(draft.id));
      expect(archived.status).toBe('archived');
    });
  });

  // ──────────────── clone ────────────────

  describe('clone()', () => {
    it('should create a copy with "(Clone)" suffix', async () => {
      const original = json(
        await service.create(validScenarioData, undefined, 'user1'),
      );

      const cloned = json(await service.clone(original.id, 'user2'));

      expect(cloned.id).not.toBe(original.id);
      expect(cloned.name).toBe('Customer Support Test (Clone)');
      expect(cloned.status).toBe('draft');
      expect(cloned.createdBy).toBe('user2');
      expect(cloned.prompt).toBe(original.prompt);
      expect(cloned.category).toBe(original.category);
      expect(cloned.version).toBe(1);
    });

    it('should allow custom name for clone', async () => {
      const original = json(await service.create(validScenarioData));

      const cloned = json(
        await service.clone(original.id, 'user2', 'My Custom Clone'),
      );

      expect(cloned.name).toBe('My Custom Clone');
    });

    it('should reset metrics on clone', async () => {
      const original = json(await service.create(validScenarioData));

      const cloned = json(await service.clone(original.id));

      expect(cloned.metrics.totalExecutions).toBe(0);
      expect(cloned.metrics.successfulExecutions).toBe(0);
      expect(cloned.metrics.averageScore).toBe(0);
    });

    it('should set parentScenarioId on clone', async () => {
      const original = json(await service.create(validScenarioData));

      const cloned = json(await service.clone(original.id));

      expect(cloned.parentScenarioId).toBeDefined();
      expect(cloned.parentScenarioId!.toString()).toBe(original.id);
    });
  });

  // ──────────────── validate ────────────────

  describe('validate()', () => {
    it('should return valid for a complete scenario', async () => {
      const created = json(
        await service.create({
          ...validScenarioData,
          description: 'Has description',
          tags: ['has-tag'],
        }),
      );

      const result = await service.validate(created.id);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for missing prompt', async () => {
      const created = json(
        await service.create({
          ...validScenarioData,
          status: 'draft',
        }),
      );

      // Manually clear the prompt
      await scenarioModel.findByIdAndUpdate(created.id, { prompt: '' });

      const result = await service.validate(created.id);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Prompt is required');
    });

    it('should return errors for missing personaIds', async () => {
      const created = json(
        await service.create({
          ...validScenarioData,
          status: 'draft',
        }),
      );

      // Manually clear personaIds
      await scenarioModel.findByIdAndUpdate(created.id, {
        personaIds: [],
      });

      const result = await service.validate(created.id);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'At least one persona is required',
      );
    });

    it('should return errors for missing agentIds', async () => {
      const created = json(
        await service.create({
          ...validScenarioData,
          status: 'draft',
        }),
      );

      // Manually clear agentIds
      await scenarioModel.findByIdAndUpdate(created.id, {
        agentIds: [],
      });

      const result = await service.validate(created.id);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'At least one agent is required',
      );
    });

    it('should return warnings for missing description', async () => {
      const created = json(
        await service.create({
          ...validScenarioData,
          description: undefined,
        }),
      );

      const result = await service.validate(created.id);

      expect(result.warnings).toContain('No description provided');
    });

    it('should return warnings for missing tags', async () => {
      const created = json(
        await service.create({
          ...validScenarioData,
          tags: [],
        }),
      );

      const result = await service.validate(created.id);

      expect(result.warnings).toContain('No tags provided');
    });

    it('should validate persona references when personaLookup is provided', async () => {
      const fakePersonaId = new Types.ObjectId().toString();
      const created = json(
        await service.create({
          ...validScenarioData,
          status: 'draft',
          personaIds: [fakePersonaId],
          agentIds: [agentId1],
        }),
      );

      const lookupFail = async () => {
        throw new NotFoundException('Not found');
      };

      const result = await service.validate(
        created.id,
        undefined,
        lookupFail,
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('not found'))).toBe(
        true,
      );
    });
  });

  // ──────────────── YAML serde ────────────────

  describe('fromYaml()', () => {
    it('should create a scenario from valid YAML', async () => {
      const yamlString = `
name: YAML Scenario
description: Imported from YAML
prompt: You are a test persona
category: support
difficulty: easy
tags:
  - yaml
  - import
personaIds:
  - ${personaId1}
agentIds:
  - ${agentId1}
`;

      const result = json(
        await service.fromYaml(yamlString, undefined, 'yaml-user'),
      );

      expect(result.id).toBeDefined();
      expect(result.name).toBe('YAML Scenario');
      expect(result.description).toBe('Imported from YAML');
      expect(result.prompt).toBe('You are a test persona');
      expect(result.category).toBe('support');
      expect(result.difficulty).toBe('easy');
      expect(result.tags).toEqual(['yaml', 'import']);
      expect(result.createdBy).toBe('yaml-user');
    });

    it('should throw on invalid YAML', async () => {
      await expect(
        service.fromYaml('not: valid: yaml: [[[', undefined, 'user'),
      ).rejects.toThrow();
    });

    it('should set workspaceId when provided', async () => {
      const workspaceId = '507f1f77bcf86cd799439011';
      const yamlString = `
name: WS YAML Scenario
prompt: Test prompt
personaIds:
  - ${personaId1}
agentIds:
  - ${agentId1}
`;

      const result = json(
        await service.fromYaml(yamlString, workspaceId, 'user'),
      );

      expect(result.workspaceId!.toString()).toBe(workspaceId);
    });
  });

  describe('toYaml()', () => {
    it('should export a scenario to valid YAML', async () => {
      const created = json(
        await service.create(
          {
            ...validScenarioData,
            description: 'Export test',
            tags: ['export'],
          },
          undefined,
          'user1',
        ),
      );

      const yamlString = service.toYaml(created);

      expect(yamlString).toBeDefined();
      expect(typeof yamlString).toBe('string');

      // Parse it back
      const parsed = yaml.load(yamlString) as Record<string, any>;
      expect(parsed.name).toBe('Customer Support Test');
      expect(parsed.description).toBe('Export test');
      expect(parsed.prompt).toBe(
        'You are a frustrated customer calling about a broken product.',
      );
      expect(parsed.category).toBe('support');
      expect(parsed.difficulty).toBe('medium');
      expect(parsed.tags).toEqual(['export']);
      expect(parsed.personaIds).toHaveLength(1);
      expect(parsed.agentIds).toHaveLength(1);
    });

    it('should produce YAML that can be re-imported (round-trip)', async () => {
      const original = json(
        await service.create(
          {
            ...validScenarioData,
            description: 'Round trip test',
            tags: ['roundtrip'],
          },
          undefined,
          'user1',
        ),
      );

      // Export to YAML
      const yamlString = service.toYaml(original);

      // Re-import from YAML
      const reimported = json(await service.fromYaml(yamlString));

      expect(reimported.name).toBe(original.name);
      expect(reimported.prompt).toBe(original.prompt);
      expect(reimported.category).toBe(original.category);
      expect(reimported.difficulty).toBe(original.difficulty);
      expect(reimported.tags).toEqual(original.tags);
    });

    it('should include optional fields when present', async () => {
      const created = json(
        await service.create(
          {
            ...validScenarioData,
            context: {
              situation: 'Customer is upset',
              objective: 'Resolve complaint',
            },
            simulationMode: 'phone',
            phoneNumber: '+14155559999',
          },
          undefined,
          'user1',
        ),
      );

      const yamlString = service.toYaml(created);
      const parsed = yaml.load(yamlString) as Record<string, any>;

      expect(parsed.context.situation).toBe('Customer is upset');
      expect(parsed.simulationMode).toBe('phone');
      expect(parsed.phoneNumber).toBe('+14155559999');
    });
  });

  // ──────────────── getScenarioStats ────────────────

  describe('getScenarioStats()', () => {
    it('should return zero stats when no scenarios exist', async () => {
      const stats = await service.getScenarioStats();
      expect(stats.total).toBe(0);
      expect(stats.totalRuns).toBe(0);
      expect(stats.activeRuns).toBe(0);
    });

    it('should return stats for created scenarios', async () => {
      await service.create(validScenarioData);
      await service.create({
        ...validScenarioData,
        name: 'Second',
        category: 'sales',
      });

      const stats = await service.getScenarioStats();
      expect(stats.total).toBe(2);
      expect(stats.byCategory.length).toBeGreaterThan(0);
      expect(stats.byStatus.length).toBeGreaterThan(0);
    });
  });
});
