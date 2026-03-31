import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock axios globally before any imports
jest.mock('axios', () => {
  const mockAxiosInstance = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  };

  const mockAxios: any = {
    create: jest.fn(() => mockAxiosInstance),
    isAxiosError: jest.fn().mockReturnValue(false),
    __mockInstance: mockAxiosInstance,
  };

  return {
    __esModule: true,
    default: mockAxios,
  };
});

// Mock inquirer
jest.mock('inquirer', () => ({
  __esModule: true,
  default: {
    prompt: jest.fn(),
  },
}));

// Mock ora
jest.mock('ora', () => {
  const spinner = {
    start: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    warn: jest.fn().mockReturnThis(),
    text: '',
  };
  return {
    __esModule: true,
    default: jest.fn(() => spinner),
  };
});

import { scaffoldProject } from '../commands/init';

describe('chanl init', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chanl-init-test-'));
    originalEnv = process.env.CHANL_CONFIG_DIR;
    process.env.CHANL_CONFIG_DIR = tmpDir;
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CHANL_CONFIG_DIR = originalEnv;
    } else {
      delete process.env.CHANL_CONFIG_DIR;
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  // =========================================================================
  // scaffoldProject — basic scaffolding (no template)
  // =========================================================================
  describe('basic scaffolding (no template)', () => {
    it('creates .env, agents/my-agent.yaml, README.md, and 3 scenarios', () => {
      const projectDir = path.join(tmpDir, 'my-project');
      const result = scaffoldProject(projectDir);

      // All expected files created
      expect(result.files).toContain('.env');
      expect(result.files).toContain('agents/my-agent.yaml');
      expect(result.files).toContain('README.md');
      expect(result.files).toContain('scenarios/angry-customer.yaml');
      expect(result.files).toContain('scenarios/billing-dispute.yaml');
      expect(result.files).toContain('scenarios/product-inquiry.yaml');
      expect(result.files).toHaveLength(6);

      // Files actually exist on disk
      expect(fs.existsSync(path.join(projectDir, '.env'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'agents/my-agent.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'README.md'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'scenarios/angry-customer.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'scenarios/billing-dispute.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'scenarios/product-inquiry.yaml'))).toBe(true);
    });

    it('creates agents/ and scenarios/ directories', () => {
      const projectDir = path.join(tmpDir, 'my-project');
      scaffoldProject(projectDir);

      expect(fs.statSync(path.join(projectDir, 'agents')).isDirectory()).toBe(true);
      expect(fs.statSync(path.join(projectDir, 'scenarios')).isDirectory()).toBe(true);
    });

    it('.env contains CHANL_OPENAI_API_KEY placeholder', () => {
      const projectDir = path.join(tmpDir, 'my-project');
      scaffoldProject(projectDir);

      const envContent = fs.readFileSync(path.join(projectDir, '.env'), 'utf-8');
      expect(envContent).toContain('CHANL_OPENAI_API_KEY=');
      expect(envContent).toContain('CHANL_PROVIDER=openai');
      expect(envContent).toContain('CHANL_SERVER_URL=');
    });

    it('agent YAML has name, model, and system_prompt', () => {
      const projectDir = path.join(tmpDir, 'my-project');
      scaffoldProject(projectDir);

      const agentContent = fs.readFileSync(
        path.join(projectDir, 'agents/my-agent.yaml'),
        'utf-8',
      );
      expect(agentContent).toContain('name: My Agent');
      expect(agentContent).toContain('model: gpt-4o');
      expect(agentContent).toContain('system_prompt:');
      expect(agentContent).toContain('temperature:');
    });

    it('scenario YAML has persona defined inline', () => {
      const projectDir = path.join(tmpDir, 'my-project');
      scaffoldProject(projectDir);

      const scenarioContent = fs.readFileSync(
        path.join(projectDir, 'scenarios/angry-customer.yaml'),
        'utf-8',
      );
      expect(scenarioContent).toContain('persona:');
      expect(scenarioContent).toContain('name: Frustrated Karen');
      expect(scenarioContent).toContain('emotion: frustrated');
      expect(scenarioContent).toContain('category: support');
      expect(scenarioContent).toContain('difficulty: hard');
    });

    it('README contains quickstart instructions', () => {
      const projectDir = path.join(tmpDir, 'my-project');
      scaffoldProject(projectDir);

      const readmeContent = fs.readFileSync(
        path.join(projectDir, 'README.md'),
        'utf-8',
      );
      expect(readmeContent).toContain('Quick start');
      expect(readmeContent).toContain('chanl scenarios run');
      expect(readmeContent).toContain('chanl run');
    });
  });

  // =========================================================================
  // scaffoldProject — with --template customer-support
  // =========================================================================
  describe('--template customer-support', () => {
    it('creates 5 scenario files', () => {
      const projectDir = path.join(tmpDir, 'cs-project');
      const result = scaffoldProject(projectDir, { template: 'customer-support' });

      const scenarioFiles = result.files.filter((f) => f.startsWith('scenarios/'));
      expect(scenarioFiles).toHaveLength(5);
      expect(scenarioFiles).toContain('scenarios/angry-customer.yaml');
      expect(scenarioFiles).toContain('scenarios/billing-dispute.yaml');
      expect(scenarioFiles).toContain('scenarios/product-inquiry.yaml');
      expect(scenarioFiles).toContain('scenarios/technical-issue.yaml');
      expect(scenarioFiles).toContain('scenarios/escalation-request.yaml');
    });

    it('technical-issue scenario has confused elderly persona', () => {
      const projectDir = path.join(tmpDir, 'cs-project');
      scaffoldProject(projectDir, { template: 'customer-support' });

      const content = fs.readFileSync(
        path.join(projectDir, 'scenarios/technical-issue.yaml'),
        'utf-8',
      );
      expect(content).toContain('name: Confused Elderly Customer');
      expect(content).toContain('emotion: confused');
    });

    it('escalation-request scenario has impatient executive persona', () => {
      const projectDir = path.join(tmpDir, 'cs-project');
      scaffoldProject(projectDir, { template: 'customer-support' });

      const content = fs.readFileSync(
        path.join(projectDir, 'scenarios/escalation-request.yaml'),
        'utf-8',
      );
      expect(content).toContain('name: Impatient Executive');
      expect(content).toContain('emotion: angry');
    });
  });

  // =========================================================================
  // scaffoldProject — with --template sales
  // =========================================================================
  describe('--template sales', () => {
    it('creates 4 sales scenario files', () => {
      const projectDir = path.join(tmpDir, 'sales-project');
      const result = scaffoldProject(projectDir, { template: 'sales' });

      const scenarioFiles = result.files.filter((f) => f.startsWith('scenarios/'));
      expect(scenarioFiles).toHaveLength(4);
      expect(scenarioFiles).toContain('scenarios/cold-outreach.yaml');
      expect(scenarioFiles).toContain('scenarios/pricing-negotiation.yaml');
      expect(scenarioFiles).toContain('scenarios/demo-request.yaml');
      expect(scenarioFiles).toContain('scenarios/competitor-comparison.yaml');
    });

    it('competitor-comparison scenario has analytical persona', () => {
      const projectDir = path.join(tmpDir, 'sales-comp-project');
      scaffoldProject(projectDir, { template: 'sales' });

      const content = fs.readFileSync(
        path.join(projectDir, 'scenarios/competitor-comparison.yaml'),
        'utf-8',
      );
      expect(content).toContain('name: Analytical Decision Maker');
      expect(content).toContain('difficulty: hard');
    });
  });

  // =========================================================================
  // scaffoldProject — directory creation
  // =========================================================================
  describe('directory creation', () => {
    it('creates subdirectory when dir argument is given', () => {
      const projectDir = path.join(tmpDir, 'nested', 'deep', 'project');
      scaffoldProject(projectDir);

      expect(fs.existsSync(projectDir)).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.env'))).toBe(true);
    });

    it('works when target directory already exists', () => {
      const projectDir = path.join(tmpDir, 'existing');
      fs.mkdirSync(projectDir, { recursive: true });

      const result = scaffoldProject(projectDir);
      expect(result.files.length).toBeGreaterThan(0);
      expect(fs.existsSync(path.join(projectDir, '.env'))).toBe(true);
    });
  });

  // =========================================================================
  // scaffoldProject — idempotency (does not overwrite existing files)
  // =========================================================================
  describe('idempotency', () => {
    it('does not overwrite existing files', () => {
      const projectDir = path.join(tmpDir, 'idem-project');

      // First scaffold
      scaffoldProject(projectDir);

      // Modify a file
      const envPath = path.join(projectDir, '.env');
      fs.writeFileSync(envPath, 'MY_CUSTOM_KEY=hello\n', 'utf-8');

      // Second scaffold — should not overwrite
      const result = scaffoldProject(projectDir);
      expect(result.files).toHaveLength(0);

      // Verify the custom content was preserved
      const envContent = fs.readFileSync(envPath, 'utf-8');
      expect(envContent).toBe('MY_CUSTOM_KEY=hello\n');
    });

    it('creates only missing files on second run', () => {
      const projectDir = path.join(tmpDir, 'partial-project');
      fs.mkdirSync(path.join(projectDir, 'scenarios'), { recursive: true });

      // Create just the .env manually
      fs.writeFileSync(path.join(projectDir, '.env'), 'CUSTOM=1\n', 'utf-8');

      // Scaffold should create everything except .env
      const result = scaffoldProject(projectDir);
      expect(result.files).not.toContain('.env');
      expect(result.files).toContain('agents/my-agent.yaml');
      expect(result.files).toContain('README.md');
      expect(result.files).toContain('scenarios/angry-customer.yaml');
    });
  });

  // =========================================================================
  // Scenario assertions — templates include inline assertions
  // =========================================================================
  describe('scenario assertions', () => {
    it('base scenarios include assertions block', () => {
      const projectDir = path.join(tmpDir, 'assert-project');
      scaffoldProject(projectDir);

      const content = fs.readFileSync(
        path.join(projectDir, 'scenarios/angry-customer.yaml'),
        'utf-8',
      );
      expect(content).toContain('assertions:');
      expect(content).toContain('type: keyword');
      expect(content).toContain('must_include:');
      expect(content).toContain('type: response_time');
      expect(content).toContain('max_seconds: 5');
    });

    it('customer-support scenarios include assertions', () => {
      const projectDir = path.join(tmpDir, 'cs-assert-project');
      scaffoldProject(projectDir, { template: 'customer-support' });

      const escalation = fs.readFileSync(
        path.join(projectDir, 'scenarios/escalation-request.yaml'),
        'utf-8',
      );
      expect(escalation).toContain('assertions:');
      expect(escalation).toContain('must_include:');

      const technical = fs.readFileSync(
        path.join(projectDir, 'scenarios/technical-issue.yaml'),
        'utf-8',
      );
      expect(technical).toContain('assertions:');
    });

    it('sales scenarios include assertions', () => {
      const projectDir = path.join(tmpDir, 'sales-assert-project');
      scaffoldProject(projectDir, { template: 'sales' });

      const cold = fs.readFileSync(
        path.join(projectDir, 'scenarios/cold-outreach.yaml'),
        'utf-8',
      );
      expect(cold).toContain('assertions:');
      expect(cold).toContain('type: keyword');
    });
  });

  // =========================================================================
  // getTemplateList — template metadata
  // =========================================================================
  describe('getTemplateList', () => {
    it('returns metadata for all available templates', () => {
      const { getTemplateList } = require('../commands/init');
      const list = getTemplateList();

      expect(list).toHaveLength(2);

      const cs = list.find((t: any) => t.name === 'customer-support');
      expect(cs).toBeDefined();
      expect(cs.scenarioCount).toBe(5);
      expect(cs.description).toContain('refund');

      const sales = list.find((t: any) => t.name === 'sales');
      expect(sales).toBeDefined();
      expect(sales.scenarioCount).toBe(4);
      expect(sales.description).toContain('outreach');
    });
  });

  // =========================================================================
  // CLI integration — command registration and execution
  // =========================================================================
  describe('CLI integration', () => {
    function clearModuleCache() {
      for (const key of Object.keys(require.cache)) {
        if (key.includes('chanl-eval/packages/cli/src/')) {
          delete require.cache[key];
        }
      }
    }

    function createFreshProgram() {
      // Write a config so the program can initialize
      fs.writeFileSync(
        path.join(tmpDir, 'config.json'),
        JSON.stringify({ server: 'http://localhost:18005' }),
      );
      clearModuleCache();
      const { createProgram } = require('../../src/index') as typeof import('../../src/index');
      return createProgram();
    }

    it('init command is registered', () => {
      const program = createFreshProgram();
      const initCmd = program.commands.find((c: any) => c.name() === 'init');
      expect(initCmd).toBeDefined();
      expect(initCmd!.description()).toContain('Scaffold');
    });

    it('templates command is registered with list subcommand', () => {
      const program = createFreshProgram();
      const templatesCmd = program.commands.find((c: any) => c.name() === 'templates');
      expect(templatesCmd).toBeDefined();
      expect(templatesCmd!.description()).toContain('template');

      const listCmd = templatesCmd!.commands.find((c: any) => c.name() === 'list');
      expect(listCmd).toBeDefined();
    });

    it('templates list prints available templates', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const program = createFreshProgram();

      await program.parseAsync(['node', 'chanl', 'templates', 'list']);

      const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(output).toContain('customer-support');
      expect(output).toContain('sales');
      expect(output).toContain('scenarios');

      consoleSpy.mockRestore();
    });

    it('init --help shows template option', () => {
      const mockWrite = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit');
      });

      const program = createFreshProgram();
      try {
        program.parse(['node', 'chanl', 'init', '--help']);
      } catch {
        // Expected: Commander calls process.exit
      }

      const output = mockWrite.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('--template');
      expect(output).toContain('customer-support');

      mockWrite.mockRestore();
      mockExit.mockRestore();
    });

    it('init creates files in cwd when no directory given', async () => {
      const projectDir = path.join(tmpDir, 'cwd-test');
      fs.mkdirSync(projectDir, { recursive: true });

      // Override cwd for the test
      const originalCwd = process.cwd;
      process.cwd = () => projectDir;

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const program = createFreshProgram();

      await program.parseAsync(['node', 'chanl', 'init']);

      // Restore
      process.cwd = originalCwd;

      // Verify files were created
      expect(fs.existsSync(path.join(projectDir, '.env'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'agents/my-agent.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'scenarios/angry-customer.yaml'))).toBe(true);

      // Verify output mentions success
      const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(output).toContain('Created chanl-eval project');
      expect(output).toContain('Next steps');

      consoleSpy.mockRestore();
    });

    it('init my-project creates files in subdirectory', async () => {
      const originalCwd = process.cwd;
      process.cwd = () => tmpDir;

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const program = createFreshProgram();

      await program.parseAsync(['node', 'chanl', 'init', 'my-project']);

      process.cwd = originalCwd;

      const projectDir = path.join(tmpDir, 'my-project');
      expect(fs.existsSync(path.join(projectDir, '.env'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'agents/my-agent.yaml'))).toBe(true);

      consoleSpy.mockRestore();
    });

    it('init --template customer-support creates 5 scenarios', async () => {
      const originalCwd = process.cwd;
      process.cwd = () => path.join(tmpDir, 'cs-cli-test');
      fs.mkdirSync(path.join(tmpDir, 'cs-cli-test'), { recursive: true });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const program = createFreshProgram();

      await program.parseAsync([
        'node', 'chanl', 'init', '--template', 'customer-support',
      ]);

      process.cwd = originalCwd;

      const scenariosDir = path.join(tmpDir, 'cs-cli-test', 'scenarios');
      const scenarioFiles = fs.readdirSync(scenariosDir);
      expect(scenarioFiles).toHaveLength(5);

      consoleSpy.mockRestore();
    });
  });
});
