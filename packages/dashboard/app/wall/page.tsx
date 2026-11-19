import { notFound, redirect } from 'next/navigation';
import { RoomWall } from '@/components/room/room-wall';
import { isCloudMode } from '@/lib/room/config';
import { currentSession, isFacilitator } from '@/lib/room/current';

export default async function WallPage() {
  if (!isCloudMode()) notFound();
  const session = await currentSession();
  if (!session) redirect('/login?next=/wall');
  if (!isFacilitator(session)) notFound();
  return <RoomWall />;
}
