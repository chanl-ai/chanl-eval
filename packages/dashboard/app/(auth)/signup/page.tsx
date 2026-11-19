import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { RoomAuthForm } from '@/components/room/room-auth-form';
import { isCloudMode } from '@/lib/room/config';

export default function SignupPage() {
  if (!isCloudMode()) notFound();
  return (
    <Suspense>
      <RoomAuthForm mode="signup" />
    </Suspense>
  );
}
