import { NextResponse, type NextRequest } from 'next/server';
import { seatFor } from '@/lib/room/accounts';
import { isForwardable } from '@/lib/room/allowlist';
import { isCloudMode } from '@/lib/room/config';
import { currentSession } from '@/lib/room/current';

/**
 * Same-origin proxy from the browser to the attendee's own seat server. The seat URL and API key
 * never reach the browser: the session cookie names the seat, and the key is added here.
 */
async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  if (!isCloudMode()) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const session = await currentSession();
  if (!session) return NextResponse.json({ message: 'Sign in first' }, { status: 401 });

  const { path } = await ctx.params;
  if (!isForwardable(req.method, path)) {
    return NextResponse.json({ message: 'This action is not available in the workshop room' }, { status: 403 });
  }

  const seat = await seatFor(session.seat);
  if (!seat) return NextResponse.json({ message: 'Your seat was not found. Ask the facilitator.' }, { status: 503 });

  const base = seat.url.replace(/\/$/, '');
  const target =
    path.length === 1 && path[0] === 'health'
      ? `${base.replace(/\/api\/v\d+$/, '')}/health`
      : `${base}/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;

  const headers = new Headers();
  for (const name of ['content-type', 'accept']) {
    const v = req.headers.get(name);
    if (v) headers.set(name, v);
  }
  headers.set('X-API-Key', seat.apiKey);

  const hasBody = req.method !== 'GET' && req.method !== 'DELETE';
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    console.error(`seat ${seat.seat} unreachable`, err);
    return NextResponse.json({ message: 'Your eval server is not responding. Try again in a moment.' }, { status: 502 });
  }

  const out = new Headers();
  for (const name of ['content-type', 'cache-control']) {
    const v = upstream.headers.get(name);
    if (v) out.set(name, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
export const dynamic = 'force-dynamic';
