/* eslint-disable @next/next/no-img-element */
'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEvalConfig } from '@/lib/eval-config';
import {
  ArrowUpRight,
  Beaker,
  Bot,
  ClipboardList,
  LogOut,
  Repeat,
  Presentation,
  Database,
  FileText,
  Home,
  ScrollText,
  Settings,
  Sparkles,
  UserCircle,
  Wrench,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from '@/components/ui/sidebar';

const primaryNav = [
  { title: 'Home', href: '/', icon: Home },
  { title: 'Generate', href: '/generate', icon: Sparkles },
  { title: 'Playground', href: '/playground', icon: Beaker },
];

const dataNav = [
  { title: 'Agents', href: '/agents', icon: Bot },
  { title: 'Runs', href: '/executions', icon: ScrollText },
  { title: 'Run sets', href: '/run-sets', icon: Repeat },
  { title: 'Scenarios', href: '/scenarios', icon: FileText },
  { title: 'Personas', href: '/personas', icon: UserCircle },
  { title: 'Mock tools', href: '/tool-fixtures', icon: Wrench },
  { title: 'Scorecards', href: '/scorecards', icon: ClipboardList },
  { title: 'Datasets', href: '/datasets', icon: Database },
];

const bottomNav = [
  { title: 'Settings', href: '/settings', icon: Settings },
];

/** Pages the workshop never uses; hidden in the room so attendees have fewer places to get lost. */
const ROOM_HIDDEN = new Set(['/generate', '/datasets', '/settings']);

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

export function EvalAppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { room } = useEvalConfig();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
              <Link href="/" className="flex items-center gap-2">
                <img src="/chanl-logo.svg" alt="Chanl" className="!size-5" />
                <span className="text-base font-semibold">Chanl Eval</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {primaryNav.filter((i) => !room.cloud || !ROOM_HIDDEN.has(i.href)).map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(pathname, item.href)}
                    tooltip={item.title}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Data</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {dataNav.filter((i) => !room.cloud || !ROOM_HIDDEN.has(i.href)).map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(pathname, item.href)}
                    tooltip={item.title}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {bottomNav.filter((i) => !room.cloud || !ROOM_HIDDEN.has(i.href)).map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(pathname, item.href)}
                    tooltip={item.title}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {room.cloud ? (
          <SidebarMenu>
            {room.facilitator && (
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Room wall">
                  <Link href="/wall">
                    <Presentation />
                    <span>Room wall</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            {room.user && (
              <SidebarMenuItem>
                <div className="px-2 py-1.5 text-xs group-data-[collapsible=icon]:hidden" data-testid="room-user">
                  <p className="font-medium truncate">{room.user.name}</p>
                  <p className="text-muted-foreground truncate">{room.user.email}</p>
                </div>
              </SidebarMenuItem>
            )}
            <SidebarMenuItem>
              <SidebarMenuButton onClick={logout} tooltip="Log out" data-testid="logout">
                <LogOut />
                <span>Log out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        ) : (
        <a
          href="https://chanl.ai?ref=eval-dashboard"
          target="_blank"
          rel="noreferrer"
          className="group mx-2 mb-2 block rounded-lg border bg-gradient-to-b from-primary/5 to-primary/10 p-3 transition-all hover:border-primary/30 hover:shadow-sm"
        >
          <div className="flex items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold">Upgrade to Cloud</p>
                <ArrowUpRight className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
                Voice agent testing, real-time monitoring, team collaboration, and production-grade analytics.
              </p>
            </div>
          </div>
        </a>
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
