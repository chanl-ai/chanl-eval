/**
 * Lightweight update check against GitHub Releases API.
 * Non-blocking — fires and forgets. Prints a message if a newer version exists.
 */
import chalk from 'chalk';

const GITHUB_RELEASES_URL =
  'https://api.github.com/repos/chanl-ai/chanl-eval/releases/latest';

function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) =>
    v.replace(/^v/, '').split('.').map(Number);
  const [la, lb, lc] = parse(latest);
  const [ca, cb, cc] = parse(current);
  if (la !== ca) return la > ca;
  if (lb !== cb) return lb > cb;
  return lc > cc;
}

/**
 * Check for updates and print a message if one is available.
 * Does not throw — silently no-ops on any error.
 */
export async function checkForUpdate(currentVersion: string): Promise<void> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(GITHUB_RELEASES_URL, {
      headers: { Accept: 'application/vnd.github.v3+json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return;

    const data = (await res.json()) as { tag_name?: string };
    const latest = data.tag_name?.replace(/^v/, '') ?? '';

    if (latest && isNewer(latest, currentVersion)) {
      console.log('');
      console.log(
        chalk.yellow(`  Update available: ${currentVersion} → ${latest}`),
      );
      console.log(
        chalk.dim('  Run: docker compose pull && docker compose up --build'),
      );
    }
  } catch {
    // Network error, timeout, etc. — silently ignore.
  }
}
