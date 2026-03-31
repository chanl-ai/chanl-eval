'use client';

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { EvalAppSidebar } from '@/components/eval-app-sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider
      style={
        {
          '--header-height': 'calc(var(--spacing) * 14)',
        } as React.CSSProperties
      }
    >
      <EvalAppSidebar />
      <SidebarInset>
        <div className="flex min-h-svh flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
