'use client';

import { EvalAppSidebar } from '@/components/eval-app-sidebar';
import { SiteHeader } from '@/components/site-header';
import { WhatsNewFloat } from '@/components/whats-new-popup';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider
      style={
        {
          '--header-height': 'calc(var(--spacing) * 16)',
        } as React.CSSProperties
      }
    >
      <EvalAppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col min-h-0 overflow-y-auto">{children}</div>
      </SidebarInset>
      <WhatsNewFloat />
    </SidebarProvider>
  );
}
