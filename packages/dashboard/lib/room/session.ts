import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'eval_session';
/** 14 hours: a full workshop day plus slack, so nobody is signed out mid-lab. */
export const SESSION_TTL_SECONDS = 14 * 60 * 60;

export interface Session {
  email: string;
  name: string;
  /** Seat id only (e.g. "seat-07"). The seat URL and key stay in the database. */
  seat: string;
  exp: number;
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

export function encodeSession(
  data: Omit<Session, 'exp'>,
  secret: string,
  now = Date.now(),
): string {
  const payload: Session = { ...data, exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export function decodeSession(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): Session | null {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(body, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Session;
    if (typeof parsed.exp !== 'number' || parsed.exp * 1000 < now) return null;
    if (!parsed.email || !parsed.seat) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production' && process.env.SESSION_INSECURE_COOKIE !== 'true',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}
