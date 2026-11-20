'use client';

/**
 * TranscriptView — Conversation transcript display for eval run results.
 *
 * Adapted from chanl-admin's call-transcript pattern, simplified for
 * text-based scenario executions. Shows alternating agent/persona messages
 * with avatars, timestamps, and duration badges.
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { Bot, ChevronDown, Search, ChevronUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BeautifulAvatar } from '@/components/shared/beautiful-avatar';
import { ToolCallList } from '@/components/shared/tool-call-list';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TranscriptMessage {
  id: string;
  role: 'agent' | 'persona' | 'tool';
  content: string;
  duration?: number;
  score?: number;
  status?: string;
  toolCalls?: Array<{
    name: string;
    arguments: Record<string, unknown>;
    result: unknown;
  }>;
}

interface TranscriptViewProps {
  messages: TranscriptMessage[];
  personaName?: string;
  className?: string;
  /** Judge evidence quotes; matching text in the transcript is highlighted. */
  evidence?: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number | undefined): string {
  if (ms == null) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-300/40 dark:bg-yellow-500/30 rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

/** Evidence quotes, cleaned of wrapping quote marks and too-short fragments that would match anywhere. */
function evidencePhrases(evidence: string[] | undefined): string[] {
  return (evidence ?? [])
    .map((e) => e.trim().replace(/^["“'‘]+|["”'’.…]+$/g, '').trim())
    .filter((e) => e.length >= 8);
}

function highlightEvidence(text: string, phrases: string[]): React.ReactNode {
  const lower = text.toLowerCase();
  const ranges: Array<[number, number]> = [];
  for (const p of phrases) {
    const at = lower.indexOf(p.toLowerCase());
    if (at >= 0) ranges.push([at, at + p.length]);
  }
  if (ranges.length === 0) return text;
  ranges.sort((a, b) => a[0] - b[0]);
  const out: React.ReactNode[] = [];
  let pos = 0;
  ranges.forEach(([start, end], i) => {
    if (start < pos) start = pos;
    if (end <= start) return;
    out.push(text.slice(pos, start));
    out.push(
      <mark key={i} data-testid="evidence-highlight" className="bg-amber-300/50 dark:bg-amber-500/30 rounded-sm px-0.5 underline decoration-amber-600 decoration-2 underline-offset-2">
        {text.slice(start, end)}
      </mark>,
    );
    pos = end;
  });
  out.push(text.slice(pos));
  return out;
}

// ---------------------------------------------------------------------------
// Message Bubble
// ---------------------------------------------------------------------------

function MessageBubble({
  message,
  personaName,
  searchQuery,
  evidence = [],
}: {
  message: TranscriptMessage;
  personaName: string;
  searchQuery: string;
  evidence?: string[];
}) {
  const isAgent = message.role === 'agent';
  const duration = formatDuration(message.duration);

  return (
    <div className="flex gap-3 group" data-message-id={message.id}>
      {/* Avatar */}
      <div className="shrink-0 pt-0.5">
        {isAgent ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Bot className="h-4 w-4" />
          </div>
        ) : (
          <BeautifulAvatar name={personaName} platform="persona" size="sm" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Speaker + metadata */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {isAgent ? 'Agent' : personaName}
          </span>
          {duration && (
            <span className="text-[10px] tabular-nums text-muted-foreground/70">
              {duration}
            </span>
          )}
          {message.score != null && (
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] px-1.5 py-0 h-4',
                message.score > 0 ? 'border-green-300 text-green-700 dark:border-green-700 dark:text-green-400' : 'border-red-300 text-red-700 dark:border-red-700 dark:text-red-400',
              )}
            >
              {message.score > 0 ? 'pass' : 'fail'}
            </Badge>
          )}
        </div>

        {/* Message body */}
        <div
          className={cn(
            'rounded-lg px-3 py-2 text-sm leading-relaxed',
            isAgent ? 'bg-primary/5 dark:bg-primary/10' : 'bg-muted',
          )}
        >
          <p className="whitespace-pre-wrap">
            {searchQuery
              ? highlightText(message.content, searchQuery)
              : evidence.length > 0
                ? highlightEvidence(message.content, evidence)
                : message.content}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool Call Bubble (adapted from chanl-admin's ToolCallCard)
// ---------------------------------------------------------------------------

function ToolCallBubble({ message }: { message: TranscriptMessage }) {
  if (!message.toolCalls?.length) return null;
  return (
    <div data-message-id={message.id}>
      <ToolCallList calls={message.toolCalls} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search Header (adapted from chanl-admin transcript-header)
// ---------------------------------------------------------------------------

function TranscriptSearchHeader({
  searchQuery,
  onSearchChange,
  matchCount,
  currentMatch,
  onPrev,
  onNext,
}: {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  matchCount: number;
  currentMatch: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center gap-2 pb-3 border-b mb-4">
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search transcript..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>
      {searchQuery && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
            {matchCount > 0 ? `${currentMatch + 1}/${matchCount}` : '0 results'}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onPrev}
            disabled={matchCount === 0}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onNext}
            disabled={matchCount === 0}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function TranscriptView({ messages, personaName = 'Persona', className, evidence }: TranscriptViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const phrases = useMemo(() => evidencePhrases(evidence), [evidence]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Search logic
  const matchingIds = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return messages
      .filter((m) => m.content.toLowerCase().includes(q))
      .map((m) => m.id);
  }, [messages, searchQuery]);

  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);

  // Reset match index when search changes
  useEffect(() => {
    setCurrentMatchIdx(0);
  }, [searchQuery]);

  // Scroll to current match
  useEffect(() => {
    if (matchingIds.length === 0 || !scrollRef.current) return;
    const targetId = matchingIds[currentMatchIdx];
    const el = scrollRef.current.querySelector(`[data-message-id="${targetId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentMatchIdx, matchingIds]);

  const handlePrev = () => {
    setCurrentMatchIdx((i) => (i <= 0 ? matchingIds.length - 1 : i - 1));
  };
  const handleNext = () => {
    setCurrentMatchIdx((i) => (i >= matchingIds.length - 1 ? 0 : i + 1));
  };

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Bot className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">No conversation recorded</p>
        <p className="text-xs text-muted-foreground mt-1">
          Run a scenario to see the transcript here.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col', className)}>
      <TranscriptSearchHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        matchCount={matchingIds.length}
        currentMatch={currentMatchIdx}
        onPrev={handlePrev}
        onNext={handleNext}
      />

      {/* Messages */}
      <div ref={scrollRef} className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        {messages.map((msg) =>
          msg.role === 'tool' ? (
            <ToolCallBubble key={msg.id} message={msg} />
          ) : (
            <MessageBubble
              key={msg.id}
              message={msg}
              personaName={personaName}
              searchQuery={searchQuery}
              evidence={phrases}
            />
          )
        )}
      </div>

      {/* Footer stats */}
      <div className="flex items-center gap-3 pt-3 mt-3 border-t text-xs text-muted-foreground">
        <span>{messages.length} messages</span>
        <span className="text-muted-foreground/40">|</span>
        <span>{messages.filter((m) => m.role === 'agent').length} agent</span>
        <span className="text-muted-foreground/40">|</span>
        <span>{messages.filter((m) => m.role === 'persona').length} persona</span>
        {messages.some((m) => m.role === 'tool') && (
          <>
            <span className="text-muted-foreground/40">|</span>
            <span>{messages.filter((m) => m.role === 'tool').length} tool calls</span>
          </>
        )}
      </div>
    </div>
  );
}
