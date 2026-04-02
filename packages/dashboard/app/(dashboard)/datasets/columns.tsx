'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTableColumnHeader } from '@/components/shared/data-table-column-header';

/** One row = one scenario with aggregated stats across its completed executions */
export interface DatasetRow {
  scenarioId: string;
  scenarioName: string;
  conversations: number;
  avgScore: number;
  minScore: number;
  maxScore: number;
  avgTurns: number;
  personaCount: number;
  latestRun: string | undefined;
  onExport?: (scenarioId: string) => void;
}

function formatRelativeDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-chart-6';
  if (score >= 60) return 'text-warning';
  return 'text-destructive';
}

export const columns: ColumnDef<DatasetRow>[] = [
  {
    accessorKey: 'scenarioName',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Scenario" />
    ),
    cell: ({ row }) => (
      <span className="text-sm font-medium truncate max-w-[220px] block">
        {row.getValue('scenarioName') as string}
      </span>
    ),
  },
  {
    accessorKey: 'conversations',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Conversations" />
    ),
    cell: ({ row }) => (
      <span className="text-sm font-semibold tabular-nums">
        {row.getValue('conversations') as number}
      </span>
    ),
  },
  {
    accessorKey: 'avgScore',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Avg Score" />
    ),
    cell: ({ row }) => {
      const avg = row.getValue('avgScore') as number;
      return (
        <span className={`text-sm font-semibold tabular-nums ${getScoreColor(avg)}`}>
          {avg}%
        </span>
      );
    },
  },
  {
    accessorKey: 'minScore',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Range" />
    ),
    cell: ({ row }) => {
      const min = row.original.minScore;
      const max = row.original.maxScore;
      return (
        <span className="text-xs text-muted-foreground tabular-nums">
          {min}–{max}%
        </span>
      );
    },
  },
  {
    accessorKey: 'avgTurns',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Avg Turns" />
    ),
    cell: ({ row }) => (
      <Badge variant="secondary" className="text-xs tabular-nums">
        {row.getValue('avgTurns') as number}
      </Badge>
    ),
  },
  {
    accessorKey: 'personaCount',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Personas" />
    ),
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground tabular-nums">
        {row.getValue('personaCount') as number}
      </span>
    ),
  },
  {
    accessorKey: 'latestRun',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Latest" />
    ),
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {formatRelativeDate(row.getValue('latestRun') as string | undefined)}
      </span>
    ),
  },
  {
    id: 'actions',
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => (
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={(e) => {
          e.stopPropagation();
          row.original.onExport?.(row.original.scenarioId);
        }}
        title="Export this scenario's conversations"
      >
        <Download className="h-4 w-4" />
        <span className="sr-only">Export</span>
      </Button>
    ),
    enableSorting: false,
  },
];
