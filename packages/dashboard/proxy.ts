import { NextResponse, type NextRequest } from 'next/server';
import { decodeSession, SESSION_COOKIE } from '@/lib/room/session';

const PUBLIC_PATHS = ['/login', '/signup', '/api/auth/'];

/**
 * In cloud mode every page needs a session. Outside cloud mode this does nothing, so the local
 * single-user dashboard behaves exactly as before.
 */
export function proxy(req: NextRequest) {
  if (process.env.CHANL_EVAL_MODE !== 'cloud') return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p))) return NextResponse.next();

  const secret = process.env.SESSION_SECRET ?? '';
  const session = secret.length >= 32 ? decodeSession(req.cookies.get(SESSION_COOKIE)?.value, secret) : null;
  if (session) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ message: 'Sign in first' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|webp)$).*)'],
};
