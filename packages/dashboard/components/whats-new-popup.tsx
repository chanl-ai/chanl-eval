'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, ExternalLink, Star } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  fetchChangelog,
  isNewerVersion,
  INSTALLED_VERSION,
  type ChangelogEntry,
} from '@/lib/changelog';

const STORAGE_KEY = 'chanl-eval-last-seen-version';

const TAG_STYLES: Record<ChangelogEntry['tag'], string> = {
  new: 'bg-primary/10 text-primary',
  improved: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  fix: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
};

export function WhatsNewFloat() {
  const [hasUnread, setHasUnread] = useState(false);
  const [open, setOpen] = useState(false);
  const [pulsing, setPulsing] = useState(false);

  // Fetch changelog from GitHub Releases (cached 1hr, fallback to hardcoded)
  const { data } = useQuery({
    queryKey: ['chanl-eval-changelog'],
    queryFn: fetchChangelog,
    staleTime: 3600_000, // 1hr
    retry: 1,
  });

  const entries = data?.entries ?? [];
  const latestVersion = data?.latestVersion ?? INSTALLED_VERSION;
  const hasUpdate = isNewerVersion(latestVersion, INSTALLED_VERSION);

  useEffect(() => {
    const lastSeen = localStorage.getItem(STORAGE_KEY);
    if (lastSeen !== latestVersion) {
      setHasUnread(true);
    }
  }, [latestVersion]);

  // Subtle attention pulse every 18s (only when popup is closed)
  useEffect(() => {
    if (open) return;
    const interval = setInterval(() => {
      setPulsing(true);
      setTimeout(() => setPulsing(false), 2000);
    }, 18000);
    const initial = setTimeout(() => {
      setPulsing(true);
      setTimeout(() => setPulsing(false), 2000);
    }, 3000);
    return () => {
      clearInterval(interval);
      clearTimeout(initial);
    };
  }, [open]);

  function handleOpen(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen && hasUnread) {
      localStorage.setItem(STORAGE_KEY, latestVersion);
      setHasUnread(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Popover open={open} onOpenChange={handleOpen}>
        <PopoverTrigger asChild>
          <button
            className="relative flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 dark:bg-zinc-800 shadow-lg transition-transform hover:scale-105 active:scale-95 select-none"
            aria-label="What's new"
            data-testid="whats-new-trigger"
          >
            {/* Subtle attention ring */}
            {pulsing && (
              <span
                className="absolute inset-0 rounded-full border-2 border-primary/40"
                style={{ animation: 'chanl-pulse 1.5s ease-out forwards' }}
              />
            )}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
              <g transform="rotate(-90 12 12)">
                <path d="M5.636 5.636a9 9 0 1 0 12.728 12.728a9 9 0 0 0 -12.728 -12.728z" />
                <path d="M16.243 7.757a6 6 0 0 0 -8.486 0" />
              </g>
            </svg>
            {(hasUnread || hasUpdate) && (
              <span className="absolute top-0 right-0 h-3 w-3 rounded-full bg-primary ring-2 ring-background" />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          sideOffset={12}
          className="w-80 p-0"
          data-testid="whats-new-popup"
        >
          {/* Update banner */}
          {hasUpdate && (
            <a
              href="https://github.com/chanl-ai/chanl-eval/releases/latest"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 bg-primary/10 text-primary text-xs font-medium hover:bg-primary/15 transition-colors"
            >
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
              <span>
                Update available: {INSTALLED_VERSION} → {latestVersion}
              </span>
            </a>
          )}

          <div className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">What&apos;s New</h3>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                v{INSTALLED_VERSION}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Latest updates to chanl-eval
            </p>
          </div>
          <Separator />
          <ScrollArea className="h-72">
            <div className="p-4 space-y-4">
              {entries.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Loading changelog...
                </p>
              ) : (
                entries.map((entry, i) => (
                  <div key={`${entry.version}-${i}`} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={`text-[10px] px-1.5 py-0 ${TAG_STYLES[entry.tag]}`}
                      >
                        {entry.tag}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        v{entry.version}
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {entry.date}
                      </span>
                    </div>
                    <p className="text-sm font-medium leading-tight">{entry.title}</p>
                    {entry.description && (
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {entry.description}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
          <Separator />
          <div className="p-3 flex items-center gap-2">
            <Button variant="outline" size="sm" className="flex-1 text-xs h-8" asChild>
              <a
                href="https://github.com/chanl-ai/chanl-eval"
                target="_blank"
                rel="noreferrer"
              >
                <Star className="mr-1.5 h-3 w-3" />
                Star on GitHub
              </a>
            </Button>
            <Button variant="outline" size="sm" className="flex-1 text-xs h-8" asChild>
              <a
                href="https://www.linkedin.com/company/chanl-ai"
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="mr-1.5 h-3 w-3" />
                Follow Updates
              </a>
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
