'use client';

import { type ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/shared/data-table-column-header';

export interface ExecutionRow {
  id: string;
  scenarioName: string;
  score: number | undefined;
  status: string;
  duration: number | undefined;
  createdAt: string | undefined;
}

// --- Cell helpers ---

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

function formatDuration(ms: number | undefined): string {
  if (ms == null) return '--';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getStatusVariant(
  status: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed':
      return 'default';
    case 'running':
    case 'pending':
      return 'secondary';
    case 'failed':
    case 'error':
      return 'destructive';
    default:
      return 'outline';
  }
}

function getScoreColor(score: number | undefined): string {
  if (score == null) return 'text-muted-foreground';
  if (score >= 80) return 'text-chart-6';
  if (score >= 60) return 'text-warning';
  return 'text-destructive';
}

// --- Column definitions ---

export const columns: ColumnDef<ExecutionRow>[] = [
  // Checkbox select
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        onClick={(e) => e.stopPropagation()}
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },

  // ID (first 8 chars, monospace, clickable)
  {
    accessorKey: 'id',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="ID" />
    ),
    cell: ({ row }) => (
      <Link
        href={`/executions/${encodeURIComponent(row.getValue('id') as string)}`}
        className="font-mono text-xs text-primary hover:underline"
        onClick={(e) => e.stopPropagation()}
        data-testid={`run-id-${row.getValue('id')}`}
      >
        {(row.getValue('id') as string).slice(0, 8)}
      </Link>
    ),
  },

  // Scenario name
  {
    accessorKey: 'scenarioName',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Scenario" />
    ),
    cell: ({ row }) => (
      <span className="text-sm font-medium truncate max-w-[200px] block">
        {row.getValue('scenarioName') as string}
      </span>
    ),
  },

  // Score (color-coded)
  {
    accessorKey: 'score',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Score" />
    ),
    cell: ({ row }) => {
      const score = row.getValue('score') as number | undefined;
      return (
        <span
          className={`text-sm font-semibold tabular-nums ${getScoreColor(score)}`}
        >
          {score != null ? `${score}%` : '--'}
        </span>
      );
    },
  },

  // Status badge
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const status = row.getValue('status') as string;
      return (
        <Badge variant={getStatusVariant(status)} className="text-xs">
          {status}
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      return value === 'all' || row.getValue(id) === value;
    },
  },

  // Duration
  {
    accessorKey: 'duration',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Duration" />
    ),
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground font-mono tabular-nums">
        {formatDuration(row.getValue('duration') as number | undefined)}
      </span>
    ),
  },

  // Date (relative)
  {
    accessorKey: 'createdAt',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Date" />
    ),
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {formatRelativeDate(row.getValue('createdAt') as string | undefined)}
      </span>
    ),
  },
];
