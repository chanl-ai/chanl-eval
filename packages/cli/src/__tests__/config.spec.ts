import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Config', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  // Dynamic import so that CHANL_CONFIG_DIR env is read fresh each time
  function requireFresh() {
    // Clear the module cache so config.ts re-reads env
    const configPath = require.resolve('../config');
    delete require.cache[configPath];
    return require('../config') as typeof import('../config');
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chanl-cli-test-'));
    originalEnv = process.env.CHANL_CONFIG_DIR;
    process.env.CHANL_CONFIG_DIR = tmpDir;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CHANL_CONFIG_DIR = originalEnv;
    } else {
      delete process.env.CHANL_CONFIG_DIR;
    }
    // Clean up temp directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('loadConfig returns defaults when no config file exists', () => {
    const { loadConfig } = requireFresh();
    const config = loadConfig();
    expect(config).toEqual({
      server: 'http://localhost:8005',
      apiKey: '',
    });
  });

  it('saveConfig creates config file and loadConfig reads it back', () => {
    const { saveConfig, loadConfig } = requireFresh();

    saveConfig({
      server: 'https://api.chanl.ai',
      apiKey: 'test-key-123',
    });

    // Verify file was created
    const configPath = path.join(tmpDir, 'config.json');
    expect(fs.existsSync(configPath)).toBe(true);

    // Verify contents
    const config = loadConfig();
    expect(config.server).toBe('https://api.chanl.ai');
    expect(config.apiKey).toBe('test-key-123');
  });

  it('setConfig updates a single key', () => {
    const { setConfig, loadConfig } = requireFresh();

    setConfig('server', 'http://custom:9000');
    const config = loadConfig();
    expect(config.server).toBe('http://custom:9000');
    expect(config.apiKey).toBe(''); // unchanged default
  });

  it('getConfig returns a single value', () => {
    const { setConfig, getConfig } = requireFresh();

    setConfig('apiKey', 'my-secret-key');
    expect(getConfig('apiKey')).toBe('my-secret-key');
  });

  it('loadConfig handles corrupted JSON gracefully', () => {
    const { loadConfig } = requireFresh();

    // Write invalid JSON
    const configPath = path.join(tmpDir, 'config.json');
    fs.writeFileSync(configPath, '{{not valid json', 'utf-8');

    const config = loadConfig();
    // Should return defaults
    expect(config.server).toBe('http://localhost:8005');
    expect(config.apiKey).toBe('');
  });

  it('saveConfig creates the directory if it does not exist', () => {
    const nestedDir = path.join(tmpDir, 'nested', 'config');
    process.env.CHANL_CONFIG_DIR = nestedDir;
    const { saveConfig } = requireFresh();

    saveConfig({ server: 'http://test:3000', apiKey: '' });

    expect(fs.existsSync(path.join(nestedDir, 'config.json'))).toBe(true);
  });

  it('setConfig preserves other config values', () => {
    const { saveConfig, setConfig, loadConfig } = requireFresh();

    saveConfig({
      server: 'http://original:8005',
      apiKey: 'original-key',
    });

    setConfig('server', 'http://new:9999');

    const config = loadConfig();
    expect(config.server).toBe('http://new:9999');
    expect(config.apiKey).toBe('original-key'); // preserved
  });
});
