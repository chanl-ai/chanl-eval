'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Mode = 'signup' | 'login';

const FIELDS: Record<Mode, Array<{ id: string; label: string; type: string; autoComplete: string }>> = {
  signup: [
    { id: 'name', label: 'Name', type: 'text', autoComplete: 'name' },
    { id: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
    { id: 'password', label: 'Password (at least 8 characters)', type: 'password', autoComplete: 'new-password' },
    { id: 'roomCode', label: 'Room code', type: 'text', autoComplete: 'off' },
  ],
  login: [
    { id: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
    { id: 'password', label: 'Password', type: 'password', autoComplete: 'current-password' },
  ],
};

export function RoomAuthForm({ mode }: { mode: Mode }) {
  const params = useSearchParams();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setPending(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message ?? 'Something went wrong. Try again.');
        return;
      }
      const next = params.get('next');
      // Full navigation so the root layout re-reads the new session cookie.
      window.location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  const isSignup = mode === 'signup';
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <form onSubmit={submit} noValidate>
          <CardHeader>
            <CardTitle className="text-xl">{isSignup ? 'Join the workshop' : 'Log in'}</CardTitle>
            <CardDescription>
              {isSignup
                ? 'Create your account with the room code on the screen. You get your own eval server.'
                : 'Use the email and password you signed up with.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {FIELDS[mode].map((f) => (
              <div key={f.id} className="space-y-2">
                <Label htmlFor={f.id}>{f.label}</Label>
                <Input
                  id={f.id}
                  name={f.id}
                  type={f.type}
                  autoComplete={f.autoComplete}
                  value={values[f.id] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                  required
                />
              </div>
            ))}
            {error && (
              <p role="alert" className="text-sm text-destructive" data-testid="auth-error">
                {error}
              </p>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-3 pt-2">
            <Button type="submit" className="w-full" disabled={pending} data-testid="auth-submit">
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSignup ? 'Create account' : 'Log in'}
            </Button>
            <p className="text-sm text-muted-foreground">
              {isSignup ? 'Already joined? ' : 'New here? '}
              <Link href={isSignup ? '/login' : '/signup'} className="underline underline-offset-4">
                {isSignup ? 'Log in' : 'Join with a room code'}
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
