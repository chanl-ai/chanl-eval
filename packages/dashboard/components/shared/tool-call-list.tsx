'use client';

import { Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatToolResult, type ToolCallView } from '@/lib/workshop';

/**
 * Every tool call in a turn with its arguments and the mock tool's response, open by default:
 * the response is often what the lesson is about (a hidden instruction in an invoice note).
 */
export function ToolCallList({ calls, compact = false }: { calls: ToolCallView[]; compact?: boolean }) {
  const text = compact ? 'text-[11px]' : 'text-xs';
  return (
    <div className="space-y-2" data-testid="tool-calls">
      {calls.map((call, i) => {
        const response = formatToolResult(call.result);
        return (
          <Card key={i} className="gap-0 overflow-hidden border-primary/20 py-0" data-testid="message-tool">
            <CardHeader className={cn('bg-primary/5 px-3', compact ? 'py-1.5' : 'py-2')}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <CardTitle className={cn('truncate font-mono font-medium', compact ? 'text-xs' : 'text-sm')}>{call.name}</CardTitle>
                </div>
                <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] text-primary">Tool call</Badge>
              </div>
            </CardHeader>
            <CardContent className={cn('space-y-2 px-3', compact ? 'py-2' : 'py-3')}>
              <div>
                <p className={cn('mb-1 font-medium text-muted-foreground', text)}>Arguments</p>
                <pre className={cn('overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 font-mono', text)}>
                  {JSON.stringify(call.arguments ?? {}, null, 2)}
                </pre>
              </div>
              <div>
                <p className={cn('mb-1 font-medium text-muted-foreground', text)}>Mock response</p>
                {response ? (
                  <pre className={cn('max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 font-mono', text)}
                    data-testid="tool-response">
                    {response}
                  </pre>
                ) : (
                  <p className={cn('text-muted-foreground', text)}>No response recorded.</p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
