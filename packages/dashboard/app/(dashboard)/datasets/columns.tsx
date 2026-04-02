'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { Download, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTableColumnHeader } from '@/components/shared/data-table-column-header';

export interface DatasetRow {
  batchId: string;
  batchName: string;
  conversations: number;
  completed: number;
  failed: number;
  avgScore: number;
  scenarioId: string;
  createdAt: string;
  onView?: (batchId: string) => void;
  onExport?: (batchId: string) => void;
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

function getStatusBadge(completed: number, failed: number, total: number) {
  if (completed === total) return <Badge variant="default" className="text-[10px]">ready</Badge>;
  if (failed === total) return <Badge variant="destructive" className="text-[10px]">failed</Badge>;
  if (completed + failed < total) return <Badge variant="secondary" className="text-[10px]">running</Badge>;
  return <Badge variant="outline" className="text-[10px]">partial</Badge>;
}

export const columns: ColumnDef<DatasetRow>[] = [
  {
    accessorKey: 'batchName',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Dataset" />
    ),
    cell: ({ row }) => (
      <div className="min-w-0">
        <span className="text-sm font-medium truncate block max-w-[240px]">
          {row.getValue('batchName') as string}
        </span>
        <span className="text-[10px] text-muted-foreground font-mono">
          {(row.original.batchId).slice(0, 14)}
        </span>
      </div>
    ),
  },
  {
    accessorKey: 'conversations',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Conversations" />
    ),
    cell: ({ row }) => {
      const { completed, failed, conversations } = row.original;
      return (
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums">{completed}</span>
          <span className="text-xs text-muted-foreground">/ {conversations}</span>
          {getStatusBadge(completed, failed, conversations)}
        </div>
      );
    },
  },
  {
    accessorKey: 'avgScore',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Avg Score" />
    ),
    cell: ({ row }) => {
      const avg = row.getValue('avgScore') as number;
      if (!avg) return <span className="text-xs text-muted-foreground">--</span>;
      return (
        <span className={`text-sm font-semibold tabular-nums ${getScoreColor(avg)}`}>
          {avg}%
        </span>
      );
    },
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {formatRelativeDate(row.getValue('createdAt') as string)}
      </span>
    ),
  },
  {
    id: 'actions',
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => (
      <div className="flex items-center gap-1 justify-end">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => { e.stopPropagation(); row.original.onView?.(row.original.batchId); }}
          title="View conversations"
        >
          <Eye className="h-4 w-4" />
          <span className="sr-only">View</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => { e.stopPropagation(); row.original.onExport?.(row.original.batchId); }}
          title="Export dataset"
        >
          <Download className="h-4 w-4" />
          <span className="sr-only">Export</span>
        </Button>
      </div>
    ),
    enableSorting: false,
  },
];
