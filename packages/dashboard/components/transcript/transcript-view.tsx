'use client';

/**
 * TranscriptView — Conversation transcript display for eval run results.
 *
 * Adapted from chanl-admin's call-transcript pattern, simplified for
 * text-based scenario executions. Shows alternating agent/persona messages
 * with avatars, timestamps, and duration badges.
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { Bot, ChevronRight, ChevronDown, Search, ChevronUp, Wrench } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BeautifulAvatar } from '@/components/shared/beautiful-avatar';
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

// ---------------------------------------------------------------------------
// Message Bubble
// ---------------------------------------------------------------------------

function MessageBubble({
  message,
  personaName,
  searchQuery,
}: {
  message: TranscriptMessage;
  personaName: string;
  searchQuery: string;
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
            {searchQuery ? highlightText(message.content, searchQuery) : message.content}
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
  const [isExpanded, setIsExpanded] = useState(false);
  const call = message.toolCalls?.[0];
  if (!call) return null;

  return (
    <div data-message-id={message.id}>
      <Card className="overflow-hidden border-primary/20">
        <CardHeader
          className="cursor-pointer select-none bg-primary/5 py-2.5 px-3"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
              <CardTitle className="text-sm font-medium font-mono">{call.name}</CardTitle>
            </div>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-primary">
              completed
            </Badge>
          </div>
          {!isExpanded && call.arguments && (
            <p className="mt-1 text-xs text-muted-foreground truncate pl-8">
              {JSON.stringify(call.arguments)}
            </p>
          )}
        </CardHeader>
        {isExpanded && (
          <CardContent className="pt-3 pb-3 space-y-3">
            {call.arguments && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Arguments</p>
                <pre className="text-xs font-mono bg-muted p-2 rounded-md overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(call.arguments, null, 2)}
                </pre>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Result</p>
              <pre className="text-xs font-mono bg-muted p-2 rounded-md overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap">
                {typeof call.result === 'string' ? call.result : JSON.stringify(call.result, null, 2)}
              </pre>
            </div>
          </CardContent>
        )}
      </Card>
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

export function TranscriptView({ messages, personaName = 'Persona', className }: TranscriptViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
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
