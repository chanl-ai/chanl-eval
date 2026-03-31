'use client';

import { type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  testId?: string;
}

function ActionButton({ action, variant = 'default' }: { action: EmptyStateAction; variant?: 'default' | 'outline' }) {
  if (action.href) {
    return (
      <Button asChild variant={variant} size="sm">
        <Link href={action.href}>{action.label}</Link>
      </Button>
    );
  }
  return (
    <Button variant={variant} size="sm" onClick={action.onClick}>
      {action.label}
    </Button>
  );
}

export function EmptyState({ icon: Icon, title, description, action, secondaryAction, testId }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 min-w-0 w-full" data-testid={testId ?? 'empty-state'}>
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
        <Icon className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-1 text-center wrap-break-word">{title}</h3>
      <p className="text-muted-foreground text-center text-sm max-w-sm mb-5 whitespace-normal wrap-break-word">{description}</p>
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3">
          {action && <ActionButton action={action} />}
          {secondaryAction && <ActionButton action={secondaryAction} variant="outline" />}
        </div>
      )}
    </div>
  );
}
