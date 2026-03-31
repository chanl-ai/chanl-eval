'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ThemeToggle } from '@/components/theme-toggle';

const LABELS: Record<string, string> = {
  executions: 'Runs',
  scenarios: 'Scenarios',
  personas: 'Personas',
  scorecards: 'Scorecards',
  settings: 'Settings',
};

function capitalize(segment: string) {
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

function generateBreadcrumbs(pathname: string) {
  const pathSegments = pathname.split('/').filter(Boolean);
  const breadcrumbs: { name: string; href: string; isCurrentPage: boolean }[] = [];

  if (pathSegments.length === 0) {
    return [{ name: 'Test', href: '/', isCurrentPage: true }];
  }

  if (pathSegments.length === 1) {
    const seg = pathSegments[0];
    const name = LABELS[seg] ?? capitalize(seg);
    return [{ name, href: pathname, isCurrentPage: true }];
  }

  const parent = pathSegments[0];
  const parentLabel = LABELS[parent] ?? capitalize(parent);
  const parentHref = `/${parent}`;

  breadcrumbs.push({ name: parentLabel, href: parentHref, isCurrentPage: false });

  const id = pathSegments[1];
  if (id && id.length === 24 && /^[a-f0-9]+$/.test(id)) {
    const singularLabels: Record<string, string> = {
      executions: 'Run',
      scenarios: 'Scenario',
      personas: 'Persona',
      scorecards: 'Scorecard',
    };
    const leaf = singularLabels[parent] ?? 'Details';
    breadcrumbs.push({ name: leaf, href: pathname, isCurrentPage: true });
  } else {
    breadcrumbs.push({ name: capitalize(id), href: pathname, isCurrentPage: true });
  }

  return breadcrumbs;
}

export function SiteHeader() {
  const pathname = usePathname();
  const breadcrumbs = generateBreadcrumbs(pathname);

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((breadcrumb, index) => (
              <React.Fragment key={`${breadcrumb.href}-${index}`}>
                <BreadcrumbItem>
                  {breadcrumb.isCurrentPage ? (
                    <BreadcrumbPage>{breadcrumb.name}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link href={breadcrumb.href}>{breadcrumb.name}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {index < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
              </React.Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
