import { cookies } from 'next/headers';
import { facilitatorEmails, isCloudMode, sessionSecret } from './config';
import { decodeSession, SESSION_COOKIE, type Session } from './session';

/** The signed-in attendee for this request, or null. Always null outside cloud mode. */
export async function currentSession(): Promise<Session | null> {
  if (!isCloudMode()) return null;
  const jar = await cookies();
  return decodeSession(jar.get(SESSION_COOKIE)?.value, sessionSecret());
}

export function isFacilitator(session: Session | null): boolean {
  return !!session && facilitatorEmails().includes(session.email.toLowerCase());
}
