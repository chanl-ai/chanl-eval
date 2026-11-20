import { NextResponse } from 'next/server';
import { login, RoomError } from '@/lib/room/accounts';
import { isCloudMode, sessionSecret } from '@/lib/room/config';
import { encodeSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/room/session';

export async function POST(req: Request) {
  if (!isCloudMode()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: 'Invalid request' }, { status: 400 });
  }
  try {
    const user = await login(body.email, body.password);
    const res = NextResponse.json({ name: user.name, email: user.email, seat: user.seat });
    res.cookies.set(SESSION_COOKIE, encodeSession(user, sessionSecret()), sessionCookieOptions());
    return res;
  } catch (err) {
    if (err instanceof RoomError) {
      return NextResponse.json({ message: err.message }, { status: err.status });
    }
    console.error('login failed', err);
    return NextResponse.json({ message: 'Log-in failed. Try again.' }, { status: 500 });
  }
}
