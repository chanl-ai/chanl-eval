'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Prompt } from '@chanl/eval-sdk';
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
import { Label } from '@/components/ui/label';
import { useEvalConfig } from '@/lib/eval-config';

/** Agents have no versions, so "v2" is a copy with its own name. */
export function SaveAsNewAgentDialog({ open, onOpenChange, source }: {
  open: boolean; onOpenChange: (o: boolean) => void; source: Prompt;
}) {
  const { client } = useEvalConfig();
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) setName(`${source.name} v2`);
  }, [open, source.name]);

  async function submit() {
    setPending(true);
    try {
      const created = await client.prompts.create({
        name: name.trim(),
        description: source.description,
        content: source.content,
        tags: source.tags,
        toolFixtureIds: source.toolFixtureIds,
        adapterConfig: source.adapterConfig,
      });
      toast.success(`Saved “${created.name}”`);
      void qc.invalidateQueries({ queryKey: ['prompts'] });
      onOpenChange(false);
      router.push(`/agents/${created.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the copy');
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]" data-testid="save-as-new-agent-dialog">
        <DialogHeader>
          <DialogTitle>Save as new agent</DialogTitle>
          <DialogDescription>Creates a copy with the current instructions. The original stays as it is.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="new-agent-name">Name</Label>
          <Input id="new-agent-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={!name.trim() || pending} data-testid="save-as-new-agent-submit">
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
