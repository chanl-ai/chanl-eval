import type React from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface PageLayoutProps {
  icon?: LucideIcon;
  title: string;
  /** Inline elements rendered next to the title (e.g. badges) */
  titleExtra?: ReactNode;
  description?: string;
  actions?: ReactNode;
  contentClassName?: string;
  /** When set, replaces the icon with a back arrow linking to this path */
  backHref?: string;
  children: ReactNode;
}

export function PageLayout({
  icon: Icon,
  title,
  titleExtra,
  description,
  actions,
  contentClassName,
  backHref,
  children,
}: PageLayoutProps) {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      {/* Header */}
      <div
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3"
        data-testid="page-header"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {backHref ? (
            <Link
              href={backHref}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted hover:bg-accent transition-colors"
              data-testid="back-button"
            >
              <ArrowLeft className="h-5 w-5 text-muted-foreground" />
            </Link>
          ) : Icon ? (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h1
                className="text-2xl font-semibold tracking-tight"
                data-testid="page-title"
              >
                {title}
              </h1>
              {titleExtra}
            </div>
            {description && (
              <p
                className="text-sm text-muted-foreground mt-1"
                data-testid="page-description"
              >
                {description}
              </p>
            )}
          </div>
        </div>

        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>

      {/* Content */}
      <div className={cn('flex-1', contentClassName)}>{children}</div>
    </div>
  );
}
