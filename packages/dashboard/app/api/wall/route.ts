import { NextResponse } from 'next/server';
import { isCloudMode } from '@/lib/room/config';
import { currentSession, isFacilitator } from '@/lib/room/current';
import { loadWall } from '@/lib/room/wall';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isCloudMode()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const session = await currentSession();
  if (!session) return NextResponse.json({ message: 'Sign in first' }, { status: 401 });
  if (!isFacilitator(session)) return NextResponse.json({ message: 'Facilitators only' }, { status: 403 });
  return NextResponse.json(await loadWall());
}
