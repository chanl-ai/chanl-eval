/**
 * Changelog — fetches from GitHub Releases API, falls back to hardcoded.
 *
 * GitHub release title format: "v0.2.0 — Reactive Persona Strategy"
 * GitHub release body: markdown bullet points, each becomes a ChangelogEntry.
 *
 * Tags are inferred from title/body prefixes:
 *   "feat:" or "new:" → new | "fix:" → fix | "improve:" → improved | default → new
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

const GITHUB_RELEASES_URL =
  'https://api.github.com/repos/chanl-ai/chanl-eval/releases';

// ---------------------------------------------------------------------------
// Parse GitHub release into ChangelogEntry[]
// ---------------------------------------------------------------------------

interface GitHubRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  published_at: string;
}

function inferTag(text: string): ChangelogEntry['tag'] {
  const lower = text.toLowerCase();
  if (lower.startsWith('fix')) return 'fix';
  if (lower.startsWith('improve') || lower.startsWith('update') || lower.startsWith('enhance'))
    return 'improved';
  return 'new';
}

function parseRelease(release: GitHubRelease): ChangelogEntry[] {
  const version = release.tag_name.replace(/^v/, '');
  const date = release.published_at
    ? new Date(release.published_at).toISOString().slice(0, 10)
    : '';

  const body = release.body?.trim();
  if (!body) {
    // No body — use the release title as a single entry
    return [
      {
        version,
        date,
        title: release.name || `Release ${version}`,
        description: '',
        tag: 'new',
      },
    ];
  }

  // Parse markdown bullet points: "- **Title**: Description" or "- Title"
  const lines = body.split('\n').filter((l) => l.match(/^\s*[-*]\s+/));

  if (lines.length === 0) {
    // No bullets — treat entire body as one entry
    return [
      {
        version,
        date,
        title: release.name || `Release ${version}`,
        description: body.slice(0, 200),
        tag: 'new',
      },
    ];
  }

  return lines.map((line) => {
    // Strip bullet prefix
    const cleaned = line.replace(/^\s*[-*]\s+/, '').trim();

    // Try "**Title**: Description" or "**Title** — Description"
    const boldMatch = cleaned.match(/^\*\*(.+?)\*\*[\s:—-]*(.*)$/);
    if (boldMatch) {
      return {
        version,
        date,
        title: boldMatch[1].trim(),
        description: boldMatch[2].trim(),
        tag: inferTag(boldMatch[1]),
      };
    }

    // Plain text — first sentence as title, rest as description
    const sentenceEnd = cleaned.search(/[.!?]\s|$/);
    const title = cleaned.slice(0, sentenceEnd + 1).trim() || cleaned.slice(0, 80);
    const description = cleaned.slice(sentenceEnd + 1).trim();

    return { version, date, title, description, tag: inferTag(title) };
  });
}

// ---------------------------------------------------------------------------
// Fetch + fallback
// ---------------------------------------------------------------------------

export async function fetchChangelog(): Promise<{
  entries: ChangelogEntry[];
  latestVersion: string;
}> {
  try {
    const res = await fetch(`${GITHUB_RELEASES_URL}?per_page=10`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
      next: { revalidate: 3600 }, // cache 1hr in Next.js
    } as RequestInit);

    if (!res.ok) throw new Error(`GitHub API ${res.status}`);

    const releases: GitHubRelease[] = await res.json();
    if (releases.length === 0) throw new Error('No releases');

    const entries = releases.flatMap(parseRelease);
    const latestVersion = releases[0].tag_name.replace(/^v/, '');

    return { entries, latestVersion };
  } catch {
    // Fallback to hardcoded
    return { entries: FALLBACK_CHANGELOG, latestVersion: INSTALLED_VERSION };
  }
}

// ---------------------------------------------------------------------------
// Version comparison
// ---------------------------------------------------------------------------

export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const [la, lb, lc] = parse(latest);
  const [ca, cb, cc] = parse(current);
  if (la !== ca) return la > ca;
  if (lb !== cb) return lb > cb;
  return lc > cc;
}

// ---------------------------------------------------------------------------
// Hardcoded fallback (used when GitHub API is unreachable)
// ---------------------------------------------------------------------------

const FALLBACK_CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.2.0',
    date: '2026-04-01',
    title: 'Reactive Persona Strategy',
    description:
      'Personas can now reason about agent responses using internal tools before replying. Designed for red-team testing.',
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
    version: '0.2.0',
    date: '2026-04-01',
    title: 'Red-Team Persona Presets',
    description:
      'Ship with 5 presets: jailbreak attacker, PII extractor, BOLA tester, prompt injector, and social engineer.',
    tag: 'new',
  },
  {
    version: '0.1.0',
    date: '2026-03-25',
    title: 'Initial Release',
    description:
      'Multi-turn conversation simulation, scorecard evaluation, tool fixture mocking, playground, and CLI.',
    tag: 'new',
  },
];
