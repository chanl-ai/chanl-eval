'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/shared/data-table-column-header';

export interface DatasetRow {
  id: string;
  scenarioName: string;
  personaName: string;
  score: number | undefined;
  turns: number;
  duration: number | undefined;
  createdAt: string | undefined;
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

function formatDuration(ms: number | undefined): string {
  if (ms == null) return '--';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getScoreColor(score: number | undefined): string {
  if (score == null) return 'text-muted-foreground';
  if (score >= 80) return 'text-chart-6';
  if (score >= 60) return 'text-warning';
  return 'text-destructive';
}

export const columns: ColumnDef<DatasetRow>[] = [
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
  {
    accessorKey: 'personaName',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Persona" />
    ),
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground truncate max-w-[160px] block">
        {row.getValue('personaName') as string}
      </span>
    ),
  },
  {
    accessorKey: 'score',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Score" />
    ),
    cell: ({ row }) => {
      const score = row.getValue('score') as number | undefined;
      return (
        <span className={`text-sm font-semibold tabular-nums ${getScoreColor(score)}`}>
          {score != null ? `${score}%` : '--'}
        </span>
      );
    },
  },
  {
    accessorKey: 'turns',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Turns" />
    ),
    cell: ({ row }) => (
      <Badge variant="secondary" className="text-xs tabular-nums">
        {row.getValue('turns') as number}
      </Badge>
    ),
  },
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
