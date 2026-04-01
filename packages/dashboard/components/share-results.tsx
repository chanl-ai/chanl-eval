'use client';

import { useRef, useState, useCallback, useMemo } from 'react';
import { toPng } from 'html-to-image';
import {
  Download,
  Share2,
  CheckCircle,
  XCircle,
  Linkedin,
  Twitter,
  Mail,
  Link as LinkIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { ScoreMetric } from '@/components/scorecard/types';

interface ShareResultsProps {
  metrics: ScoreMetric[];
  overallScore?: number;
  scenarioName?: string;
  executionDate?: string;
  turnCount?: number;
  duration?: string;
}

// ---------------------------------------------------------------------------
// Auto-generate an "aha" summary from the criteria results
// ---------------------------------------------------------------------------

function generateSummary(
  metrics: ScoreMetric[],
  percentage: number,
  scenarioName?: string,
): string {
  const allCriteria = metrics.flatMap(
    (m) => (m.criteria || []).map((c) => ({ ...c, category: m.name })),
  );
  const failures = allCriteria.filter((c) => !c.passed);

  // Lead with the biggest finding
  const topFailure = failures[0];
  const scenario = scenarioName || 'our AI agent';

  if (topFailure?.explanation) {
    const reason = topFailure.explanation.length > 100
      ? topFailure.explanation.slice(0, 100) + '...'
      : topFailure.explanation;
    return `Tested "${scenario}" — scored ${percentage}%. ${topFailure.name}: ${reason}\n\ngithub.com/chanl-ai/chanl-eval`;
  }

  if (failures.length > 0) {
    return `Tested "${scenario}" — scored ${percentage}%. Failed on ${failures.map((f) => f.name).slice(0, 3).join(', ')}.\n\ngithub.com/chanl-ai/chanl-eval`;
  }

  return `Tested "${scenario}" — ${percentage}% across ${allCriteria.length} criteria.\n\ngithub.com/chanl-ai/chanl-eval`;
}

// ---------------------------------------------------------------------------
// Share helpers
// ---------------------------------------------------------------------------

function shareToLinkedIn(text: string) {
  // Open window synchronously from click to avoid popup blocker,
  // then copy text to clipboard. LinkedIn doesn't support pre-filled text.
  const win = window.open(
    'https://www.linkedin.com/feed/?shareActive=true',
    '_blank',
  );
  if (!win) {
    // Popup blocked — fall back to copy only
    navigator.clipboard.writeText(text);
    toast.error('Popup blocked — text copied to clipboard instead');
    return;
  }
  navigator.clipboard.writeText(text).then(() => {
    toast.success('Text copied — paste it into your LinkedIn post');
  });
}

function shareToTwitter(text: string) {
  const encoded = encodeURIComponent(text);
  window.open(`https://x.com/intent/tweet?text=${encoded}`, '_blank');
}

function shareViaEmail(text: string, scenarioName?: string) {
  const subject = encodeURIComponent(
    `AI Agent Eval Results${scenarioName ? `: ${scenarioName}` : ''}`,
  );
  const body = encodeURIComponent(text);
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
  toast.success('Copied to clipboard');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ShareResults({
  metrics,
  overallScore,
  scenarioName,
  executionDate,
  turnCount,
  duration,
}: ShareResultsProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const allCriteria = useMemo(
    () => metrics.flatMap((m) => (m.criteria || []).map((c) => ({ ...c, category: m.name }))),
    [metrics],
  );
  const passes = allCriteria.filter((c) => c.passed);
  const failures = allCriteria.filter((c) => !c.passed);
  const totalPassed = passes.length;
  const totalCriteria = allCriteria.length;
  const percentage =
    overallScore ?? (totalCriteria > 0 ? Math.round((totalPassed / totalCriteria) * 100) : 0);
  const scoreColor =
    percentage >= 80 ? '#4ade80' : percentage >= 60 ? '#fbbf24' : '#f87171';

  const defaultSummary = useMemo(
    () => generateSummary(metrics, percentage, scenarioName),
    [metrics, percentage, scenarioName],
  );
  const [summary, setSummary] = useState('');

  // Initialize summary on dialog open
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open && !summary) setSummary(defaultSummary);
    },
    [defaultSummary, summary],
  );

  const handleDownload = useCallback(async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        backgroundColor: '#09090b',
      });
      const link = document.createElement('a');
      link.download = `chanl-eval-${scenarioName || 'results'}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      toast.success('Image downloaded');
    } catch {
      toast.error('Failed to generate image');
    } finally {
      setDownloading(false);
    }
  }, [scenarioName]);

  return (
    <Dialog onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="share-results-button">
          <Share2 className="mr-2 h-3.5 w-3.5" />
          Share Results
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Share Results</DialogTitle>
        </DialogHeader>

        {/* ---- Scrollable body ---- */}
        <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-4">
          {/* Shareable card (rendered to PNG) */}
          <div
            ref={cardRef}
            className="rounded-xl overflow-hidden"
            style={{
              backgroundColor: '#09090b',
              color: '#fafafa',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '24px 24px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fafafa"
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
                <span style={{ fontSize: '14px', fontWeight: 600 }}>chanl-eval</span>
              </div>
              <span style={{ fontSize: '11px', color: '#71717a' }}>
                {executionDate || new Date().toLocaleDateString()}
              </span>
            </div>

            {/* Scenario + meta */}
            <div style={{ padding: '0 24px 16px' }}>
              {scenarioName && (
                <p style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 4px' }}>
                  {scenarioName}
                </p>
              )}
              <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#a1a1aa' }}>
                {turnCount != null && <span>{turnCount} turns</span>}
                {duration && <span>{duration}</span>}
                <span>
                  {totalPassed}/{totalCriteria} criteria
                </span>
              </div>
            </div>

            {/* Score bar */}
            <div style={{ padding: '0 24px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span
                  style={{
                    fontSize: '48px',
                    fontWeight: 700,
                    lineHeight: 1,
                    color: scoreColor,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {percentage}%
                </span>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      height: '8px',
                      borderRadius: '4px',
                      backgroundColor: '#27272a',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${percentage}%`,
                        borderRadius: '4px',
                        backgroundColor: scoreColor,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* What failed */}
            {failures.length > 0 && (
              <div style={{ padding: '0 24px 16px' }}>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#f87171',
                    marginBottom: '8px',
                  }}
                >
                  What failed
                </div>
                <div
                  style={{
                    borderRadius: '8px',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    overflow: 'hidden',
                  }}
                >
                  {failures.slice(0, 5).map((c, i) => (
                    <div
                      key={`fail-${i}`}
                      style={{
                        padding: '10px 14px',
                        borderBottom:
                          i < Math.min(failures.length, 5) - 1
                            ? '1px solid rgba(239, 68, 68, 0.1)'
                            : 'none',
                        backgroundColor: 'rgba(239, 68, 68, 0.04)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginBottom: c.explanation ? '4px' : 0,
                        }}
                      >
                        <XCircle
                          style={{ width: '14px', height: '14px', color: '#f87171', flexShrink: 0 }}
                        />
                        <span style={{ fontSize: '13px', fontWeight: 500, color: '#fafafa' }}>
                          {c.name}
                        </span>
                      </div>
                      {c.explanation && (
                        <p
                          style={{
                            fontSize: '12px',
                            color: '#a1a1aa',
                            margin: '0 0 0 22px',
                            lineHeight: 1.4,
                          }}
                        >
                          {c.explanation.length > 140
                            ? c.explanation.slice(0, 140) + '...'
                            : c.explanation}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* What passed — compact */}
            {passes.length > 0 && (
              <div style={{ padding: '0 24px 20px' }}>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#4ade80',
                    marginBottom: '8px',
                  }}
                >
                  What passed
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {passes.map((c, i) => (
                    <span
                      key={`pass-${i}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '12px',
                        color: '#a1a1aa',
                        backgroundColor: 'rgba(74, 222, 128, 0.06)',
                        border: '1px solid rgba(74, 222, 128, 0.15)',
                        borderRadius: '6px',
                        padding: '3px 8px',
                      }}
                    >
                      <CheckCircle style={{ width: '12px', height: '12px', color: '#4ade80' }} />
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Card footer */}
            <div
              style={{
                padding: '12px 24px',
                borderTop: '1px solid #27272a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: '11px', color: '#71717a' }}>
                github.com/chanl-ai/chanl-eval
              </span>
              <span style={{ fontSize: '11px', color: '#71717a' }}>
                Open source conversation testing
              </span>
            </div>
          </div>

          {/* Editable summary */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Post text (editable)</label>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              className="text-sm resize-none"
              data-testid="share-summary-textarea"
            />
          </div>
        </div>

        {/* ---- Sticky footer: all buttons in one row ---- */}
        <div className="flex items-center gap-2 pt-4 border-t -mx-6 px-6">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => shareToLinkedIn(summary)}>
            <Linkedin className="h-3.5 w-3.5" />
            LinkedIn
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => shareToTwitter(summary)}>
            <Twitter className="h-3.5 w-3.5" />
            X
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => shareViaEmail(summary, scenarioName)}>
            <Mail className="h-3.5 w-3.5" />
            Email
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => copyToClipboard(summary)}>
            <LinkIcon className="h-3.5 w-3.5" />
            Copy
          </Button>
          <Button
            size="sm"
            className="ml-auto gap-1.5"
            onClick={handleDownload}
            disabled={downloading}
            data-testid="download-share-image"
          >
            <Download className="h-3.5 w-3.5" />
            {downloading ? 'Saving...' : 'Image'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
