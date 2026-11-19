import { NextResponse } from 'next/server';
import { RoomError, signup } from '@/lib/room/accounts';
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
    const user = await signup({
      name: body.name,
      email: body.email,
      password: body.password,
      roomCode: body.roomCode,
    });
    const res = NextResponse.json({ name: user.name, email: user.email, seat: user.seat });
    res.cookies.set(SESSION_COOKIE, encodeSession(user, sessionSecret()), sessionCookieOptions());
    return res;
  } catch (err) {
    if (err instanceof RoomError) {
      return NextResponse.json({ message: err.message }, { status: err.status });
    }
    console.error('signup failed', err);
    return NextResponse.json({ message: 'Sign-up failed. Try again.' }, { status: 500 });
  }
}
