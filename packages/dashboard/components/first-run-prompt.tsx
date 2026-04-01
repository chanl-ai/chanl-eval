'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Star, ExternalLink } from 'lucide-react';

const STORAGE_KEY = 'chanl-eval-first-run-prompted';

/**
 * Shows a one-time toast after the user views their first completed execution.
 * Dismissed permanently via localStorage.
 */
export function useFirstRunPrompt(hasCompletedExecution: boolean) {
  const shown = useRef(false);

  useEffect(() => {
    if (!hasCompletedExecution || shown.current) return;
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed) return;

    shown.current = true;

    // Small delay so the page content renders first
    const timer = setTimeout(() => {
      toast(
        'chanl-eval is free and open source',
        {
          description: 'Star us on GitHub or follow on LinkedIn to stay updated.',
          duration: 12000,
          action: {
            label: '⭐ Star on GitHub',
            onClick: () => {
              window.open('https://github.com/chanl-ai/chanl-eval', '_blank');
            },
          },
          onDismiss: () => {
            localStorage.setItem(STORAGE_KEY, 'true');
          },
          onAutoClose: () => {
            localStorage.setItem(STORAGE_KEY, 'true');
          },
        },
      );
    }, 2000);

    return () => clearTimeout(timer);
  }, [hasCompletedExecution]);
}
