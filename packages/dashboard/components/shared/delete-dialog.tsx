'use client';

import { useState, useCallback, useEffect } from 'react';
import { TriangleAlert, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface DeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: string;
  entityName?: string;
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;
  requireNameConfirmation?: boolean;
  count?: number;
  description?: string;
  confirmText?: string;
  testIdPrefix?: string;
  children?: React.ReactNode;
}

export function DeleteDialog({
  open,
  onOpenChange,
  entityType,
  entityName,
  onConfirm,
  isLoading = false,
  requireNameConfirmation = false,
  count,
  description,
  confirmText,
  testIdPrefix,
  children,
}: DeleteDialogProps) {
  const [confirmName, setConfirmName] = useState('');
  const prefix = testIdPrefix ?? entityType.toLowerCase();

  useEffect(() => {
    if (!open) setConfirmName('');
  }, [open]);

  const isBulk = count !== undefined && count > 1;
  const title = isBulk ? `Delete ${count} ${entityType}s` : `Delete ${entityType}`;
  const defaultDescription = isBulk
    ? `Are you sure you want to delete ${count} selected ${entityType.toLowerCase()}${count > 1 ? 's' : ''}?`
    : entityName
      ? `Are you sure you want to delete "${entityName}"?`
      : `Are you sure you want to delete this ${entityType.toLowerCase()}?`;

  const buttonText = confirmText ?? (isBulk ? `Delete ${count}` : 'Delete');

  const isConfirmDisabled =
    isLoading || (requireNameConfirmation && confirmName !== entityName);

  const handleConfirm = useCallback(async () => {
    await onConfirm();
  }, [onConfirm]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]" data-testid={`delete-${prefix}-dialog`}>
        <DialogHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <TriangleAlert className="h-6 w-6 text-destructive" />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-center">
            {description ?? defaultDescription}
            <br />
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {children}

        {requireNameConfirmation && entityName && (
          <div className="space-y-3 py-2">
            <p className="text-sm font-semibold text-center">
              Please enter &apos;{entityName}&apos; to confirm deletion.
            </p>
            <Input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={entityName}
              data-testid={`delete-${prefix}-confirm-input`}
              autoComplete="off"
            />
          </div>
        )}

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            data-testid={`delete-${prefix}-cancel-btn`}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            data-testid={`delete-${prefix}-confirm-btn`}
          >
            {isLoading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              buttonText
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
