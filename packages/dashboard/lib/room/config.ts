/**
 * Cloud ("room") mode settings, read at request time. The deployed image is built without these
 * values, so nothing here may be read at module scope or baked in by a static prerender.
 */
export function isCloudMode(): boolean {
  return process.env.CHANL_EVAL_MODE === 'cloud';
}

export function roomCode(): string {
  return (process.env.ROOM_CODE ?? '').trim();
}

export function roomMongoUri(): string {
  const uri = process.env.ROOM_MONGODB_URI;
  if (!uri) throw new Error('ROOM_MONGODB_URI is not set');
  return uri;
}

export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET ?? '';
  // A short secret makes the signed cookie guessable, which would let anyone pick any seat.
  if (secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  return secret;
}

export function facilitatorEmails(): string[] {
  return (process.env.FACILITATOR_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
