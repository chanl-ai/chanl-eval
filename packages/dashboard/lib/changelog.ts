/**
 * Changelog for the "What's New" popup.
 *
 * Primary source: changelog.json at repo root, fetched via raw GitHub.
 * Fallback: baked-in entries (for offline / rate-limited).
 *
 * To update: edit changelog.json in repo root, commit, push.
 * All running dashboards pick it up within 1 hour (cache TTL).
 */

import pkgJson from '../package.json';

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  description: string;
  tag: 'new' | 'improved' | 'fix';
}

export const INSTALLED_VERSION = pkgJson.version ?? '0.1.0';

const CHANGELOG_URL =
  'https://raw.githubusercontent.com/chanl-ai/chanl-eval/main/changelog.json';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchChangelog(): Promise<{
  entries: ChangelogEntry[];
  latestVersion: string;
}> {
  const entries = await fetchRemoteChangelog();
  const latestVersion = entries[0]?.version ?? INSTALLED_VERSION;
  return { entries, latestVersion };
}

export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const [la, lb, lc] = parse(latest);
  const [ca, cb, cc] = parse(current);
  if (la !== ca) return la > ca;
  if (lb !== cb) return lb > cb;
  return lc > cc;
}

// ---------------------------------------------------------------------------
// Remote fetch with fallback
// ---------------------------------------------------------------------------

async function fetchRemoteChangelog(): Promise<ChangelogEntry[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(CHANGELOG_URL, {
      signal: controller.signal,
      next: { revalidate: 3600 }, // cache 1hr in Next.js
    } as RequestInit);
    clearTimeout(timeout);
    if (!res.ok) return FALLBACK_CHANGELOG;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return FALLBACK_CHANGELOG;
    return data as ChangelogEntry[];
  } catch {
    return FALLBACK_CHANGELOG;
  }
}

// ---------------------------------------------------------------------------
// Baked-in fallback (offline / rate-limited / first load)
// ---------------------------------------------------------------------------

const FALLBACK_CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.3.0',
    date: '2026-04-02',
    title: 'Training Data Generation',
    description:
      'Turn your evaluation runs into fine-tuning datasets. Generate conversations at scale, then export as OpenAI JSONL, ShareGPT, or DPO preference pairs.',
    tag: 'new',
  },
  {
    version: '0.3.0',
    date: '2026-04-02',
    title: 'Datasets Dashboard',
    description:
      'New Datasets page to generate, browse, and export training data. View individual conversations, download in your preferred format, filter by score.',
    tag: 'new',
  },
  {
    version: '0.3.0',
    date: '2026-04-02',
    title: 'Richer Persona Backstories',
    description:
      'All seed personas rewritten with detailed second-person backstories. Better personas = better training data.',
    tag: 'improved',
  },
  {
    version: '0.2.0',
    date: '2026-04-01',
    title: 'Playground Overhaul',
    description:
      'Prompt editor, scenario/persona selectors, tool call rendering, and chat restart. Manual testing is now a first-class workflow.',
    tag: 'new',
  },
  {
    version: '0.2.0',
    date: '2026-04-01',
    title: 'Scorecard Builder',
    description:
      '3-column layout with category sidebar, criteria cards, and per-criteria weights. Build evaluation rubrics visually.',
    tag: 'new',
  },
  {
    version: '0.2.0',
    date: '2026-04-01',
    title: 'Reactive Persona Strategy',
    description:
      'Personas reason about agent responses using internal tools before replying. Designed for red-team and stress testing.',
    tag: 'new',
  },
  {
    version: '0.2.0',
    date: '2026-04-01',
    title: '5 New Evaluation Criteria',
    description:
      'Hallucination detection, knowledge retention, conversation completeness, role adherence, and RAG faithfulness.',
    tag: 'new',
  },
  {
    version: '0.1.0',
    date: '2026-03-25',
    title: 'Initial Release',
    description:
      'Multi-turn conversation simulation, scorecard evaluation, persona engine, CLI, and dashboard.',
    tag: 'new',
  },
];
