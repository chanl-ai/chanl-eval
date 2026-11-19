import type { Metadata } from 'next';
import { Ubuntu, Azeret_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { QueryProvider } from '@/components/providers/query-provider';
import { EvalConfigProvider, type RoomInfo } from '@/lib/eval-config';
import { isCloudMode } from '@/lib/room/config';
import { currentSession, isFacilitator } from '@/lib/room/current';
import { Toaster } from '@/components/ui/sonner';

const ubuntu = Ubuntu({
  variable: '--font-ubuntu',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
});

const azeretMono = Azeret_Mono({
  variable: '--font-azeret-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Chanl Eval',
  description: 'Local AI agent scenario testing',
};

// Cloud mode is decided by runtime env. A static prerender would freeze whatever mode the build
// machine had, and the deployed image is built without the room's env.
export const dynamic = 'force-dynamic';

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await currentSession();
  const room: RoomInfo = {
    cloud: isCloudMode(),
    user: session ? { name: session.name, email: session.email, seat: session.seat } : null,
    facilitator: isFacilitator(session),
  };
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${ubuntu.variable} ${azeretMono.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <QueryProvider>
            <EvalConfigProvider room={room}>{children}</EvalConfigProvider>
          </QueryProvider>
        </ThemeProvider>
        <Toaster />
      </body>
    </html>
  );
}
