/**
 * Which seat-server routes the browser may reach through /api/eval. Anything not listed is refused:
 * /settings would let an attendee read or replace the room's provider key, and /api-keys would let
 * them mint or revoke the seat's own key.
 */
const ALLOWED_ROOTS = new Set([
  'prompts',
  'scenarios',
  'executions',
  'personas',
  'scorecards',
  'tool-fixtures',
  'run-sets',
  'chat',
  'datasets',
  'templates',
  'generation',
  'labels',
]);

const METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);

export function isForwardable(method: string, segments: string[]): boolean {
  const m = method.toUpperCase();
  if (!METHODS.has(m)) return false;
  if (segments.length === 0) return false;
  for (const s of segments) {
    if (s === '' || s === '.' || s === '..' || s.includes('/') || s.includes('\\')) return false;
  }
  if (segments.length === 1 && segments[0] === 'health') return m === 'GET';
  return ALLOWED_ROOTS.has(segments[0]);
}
