/** Links into the playground that carry what to run, so it opens on the right scenario and agent. */
export function playgroundHref(p: { scenarioId?: string; agentId?: string; personaId?: string; scorecardId?: string }): string {
  const q = new URLSearchParams();
  if (p.scenarioId) q.set('scenario', p.scenarioId);
  if (p.agentId) q.set('agent', p.agentId);
  if (p.personaId) q.set('persona', p.personaId);
  if (p.scorecardId) q.set('scorecard', p.scorecardId);
  const s = q.toString();
  return s ? `/playground?${s}` : '/playground';
}

const LAST_AGENT_KEY = 'chanl-eval-last-agent';

export function readLastAgent(): string | null {
  try { return localStorage.getItem(LAST_AGENT_KEY); } catch { return null; }
}

export function rememberLastAgent(id: string): void {
  try { localStorage.setItem(LAST_AGENT_KEY, id); } catch { /* storage blocked */ }
}
