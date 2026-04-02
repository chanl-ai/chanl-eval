/**
 * Integration tests for the dataset export API.
 *
 * These tests hit the live chanl-eval server (localhost:18005) and validate
 * that export endpoints return correctly formatted training data.
 *
 * Prerequisites:
 *   - Server running: `node packages/server/dist/main.js`
 *   - MongoDB + Redis running: `docker compose up -d mongodb redis`
 *   - At least one completed execution in the database (seeded on first boot)
 */

const SERVER_URL = process.env.CHANL_EVAL_SERVER || 'http://localhost:18005';
const API = `${SERVER_URL}/api/v1`;

interface PreviewResponse {
  count: number;
  avgScore: number;
  sampleLine: string | null;
  format: string;
}

// Skip if server isn't running
async function isServerUp(): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

describe('Dataset Export Integration', () => {
  let serverAvailable = false;

  beforeAll(async () => {
    serverAvailable = await isServerUp();
    if (!serverAvailable) {
      console.warn('⚠ Skipping integration tests — server not running on ' + SERVER_URL);
    }
  });

  // ── Preview endpoint ─────────────────────────────────────────────

  describe('GET /datasets/export/preview', () => {
    it('should return count, avgScore, and format', async () => {
      if (!serverAvailable) return;

      const res = await fetch(`${API}/datasets/export/preview?format=openai`);
      expect(res.ok).toBe(true);

      const data = (await res.json()) as PreviewResponse;
      expect(data.count).toBeGreaterThanOrEqual(0);
      expect(data.format).toBe('openai');
      expect(typeof data.avgScore).toBe('number');
    });

    it('should return a valid OpenAI sample line when data exists', async () => {
      if (!serverAvailable) return;

      const res = await fetch(`${API}/datasets/export/preview?format=openai`);
      const data = (await res.json()) as PreviewResponse;

      if (data.count > 0 && data.sampleLine) {
        const parsed = JSON.parse(data.sampleLine);
        expect(parsed.messages).toBeDefined();
        expect(Array.isArray(parsed.messages)).toBe(true);

        // Every message must have a role
        for (const msg of parsed.messages) {
          expect(['system', 'user', 'assistant', 'tool']).toContain(msg.role);
        }

        // Must have at least one user and one assistant
        const roles = new Set(parsed.messages.map((m: { role: string }) => m.role));
        expect(roles.has('user')).toBe(true);
        expect(roles.has('assistant')).toBe(true);
      }
    });

    it('should support sharegpt format preview', async () => {
      if (!serverAvailable) return;

      const res = await fetch(`${API}/datasets/export/preview?format=sharegpt`);
      const data = (await res.json()) as PreviewResponse;

      if (data.count > 0 && data.sampleLine) {
        const parsed = JSON.parse(data.sampleLine);
        expect(parsed.conversations).toBeDefined();
        expect(parsed.conversations[0].from).toBe('human');
      }
    });

    it('should filter by minScore', async () => {
      if (!serverAvailable) return;

      const allRes = await fetch(`${API}/datasets/export/preview?format=openai`);
      const allData = (await allRes.json()) as PreviewResponse;

      const filteredRes = await fetch(`${API}/datasets/export/preview?format=openai&minScore=90`);
      const filteredData = (await filteredRes.json()) as PreviewResponse;

      // High minScore should return equal or fewer results
      expect(filteredData.count).toBeLessThanOrEqual(allData.count);
    });
  });

  // ── Export endpoint ──────────────────────────────────────────────

  describe('POST /datasets/export', () => {
    it('should stream valid OpenAI JSONL', async () => {
      if (!serverAvailable) return;

      const res = await fetch(`${API}/datasets/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'openai' }),
      });

      expect(res.ok).toBe(true);

      const text = await res.text();
      const lines = text.split('\n').filter(Boolean);

      if (lines.length === 0) {
        // No data — that's fine for a fresh DB
        return;
      }

      // Every line must be valid JSON
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }

      // First line must have messages array
      const first = JSON.parse(lines[0]);
      expect(first.messages).toBeDefined();
      expect(Array.isArray(first.messages)).toBe(true);
    });

    it('should stream valid ShareGPT JSON array', async () => {
      if (!serverAvailable) return;

      const res = await fetch(`${API}/datasets/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'sharegpt' }),
      });

      expect(res.ok).toBe(true);

      const text = await res.text();

      // ShareGPT is a JSON array
      const parsed = JSON.parse(text);
      expect(Array.isArray(parsed)).toBe(true);

      if (parsed.length > 0) {
        expect(parsed[0].conversations).toBeDefined();
        const roles = parsed[0].conversations.map((c: { from: string }) => c.from);
        expect(roles).toContain('human');
        expect(roles).toContain('gpt');
      }
    });

    it('should set Content-Disposition header for download', async () => {
      if (!serverAvailable) return;

      const res = await fetch(`${API}/datasets/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'openai' }),
      });

      const disposition = res.headers.get('content-disposition');
      expect(disposition).toContain('attachment');
      expect(disposition).toContain('dataset-openai-');
      expect(disposition).toContain('.jsonl');
    });

    it('should respect minScore filter', async () => {
      if (!serverAvailable) return;

      const allRes = await fetch(`${API}/datasets/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'openai' }),
      });
      const allLines = (await allRes.text()).split('\n').filter(Boolean);

      const filteredRes = await fetch(`${API}/datasets/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'openai', filters: { minScore: 90 } }),
      });
      const filteredLines = (await filteredRes.text()).split('\n').filter(Boolean);

      expect(filteredLines.length).toBeLessThanOrEqual(allLines.length);
    });

    it('should produce valid OpenAI fine-tuning format (messages array with role/content)', async () => {
      if (!serverAvailable) return;

      const res = await fetch(`${API}/datasets/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'openai' }),
      });

      const lines = (await res.text()).split('\n').filter(Boolean);
      if (lines.length === 0) return;

      for (const line of lines) {
        const parsed = JSON.parse(line);

        // Must have messages array
        expect(parsed.messages).toBeDefined();

        for (const msg of parsed.messages) {
          // Every message must have a role
          expect(msg.role).toBeDefined();
          expect(['system', 'user', 'assistant', 'tool']).toContain(msg.role);

          // Non-tool messages must have content
          if (msg.role !== 'tool' && !msg.tool_calls) {
            expect(typeof msg.content).toBe('string');
            expect(msg.content.length).toBeGreaterThan(0);
          }
        }

        // Conversation must alternate between user and assistant
        const nonSystem = parsed.messages.filter((m: { role: string }) => m.role !== 'system');
        if (nonSystem.length >= 2) {
          expect(nonSystem[0].role).toBe('user');
        }
      }
    });
  });

  // ── DPO export ─────────────────────────────────────────────────

  describe('POST /datasets/export (dpo)', () => {
    it('should produce valid DPO pairs when sufficient data exists', async () => {
      if (!serverAvailable) return;

      const res = await fetch(`${API}/datasets/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'dpo' }),
      });

      expect(res.ok).toBe(true);

      const lines = (await res.text()).split('\n').filter(Boolean);

      // DPO requires 2+ executions of the same scenario
      // May be empty if all executions are from different scenarios
      for (const line of lines) {
        const parsed = JSON.parse(line);
        expect(parsed.input).toBeDefined();
        expect(parsed.input.messages).toBeDefined();
        expect(parsed.preferred_output).toBeDefined();
        expect(parsed.non_preferred_output).toBeDefined();
        expect(parsed.preferred_output.length).toBeGreaterThan(0);
        expect(parsed.non_preferred_output.length).toBeGreaterThan(0);
      }
    });
  });
});
