import type React from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface PageLayoutProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actions?: ReactNode;
  contentClassName?: string;
  children: ReactNode;
}

export function PageLayout({
  icon: Icon,
  title,
  description,
  actions,
  contentClassName,
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
          {Icon && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1
              className="text-2xl font-semibold tracking-tight"
              data-testid="page-title"
            >
              {title}
            </h1>
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
