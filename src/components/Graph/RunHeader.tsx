// src/components/Graph/RunHeader.tsx
// Breadcrumb strip above the graph: which run you're looking at, and its
// headline counts. Per the Claude Design handoff.

import type { AnalysisStats } from '../../types';
import { splitUrl } from '../../utils/runSummary';

const MONO = 'var(--font-mono)';

interface RunHeaderProps {
  prUrl?: string;
  prTitle?: string;
  stats?: AnalysisStats;
  /** Total risks across every source — drives the issue chip's colour. */
  issueCount: number;
  /** Outbound API calls found in the diff — counted from the flows. */
  apiCalls: number;
  onBackToHistory: () => void;
}

function StatChip({ value, label, tone = 'neutral' }: {
  value: number; label: string; tone?: 'neutral' | 'warn';
}) {
  const warn = tone === 'warn';
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 5,
      fontFamily: MONO, fontSize: 10.5,
      color: warn ? 'var(--sev2)' : 'var(--t5)',
      border: `1px solid ${warn ? 'var(--warn-bd)' : 'var(--bd3)'}`,
      background: warn ? 'var(--sev2-bg)' : 'transparent',
      borderRadius: 5, padding: '4px 8px', whiteSpace: 'nowrap',
    }}>
      <b style={{ color: warn ? 'var(--sev2)' : 'var(--t1)', fontWeight: 600 }}>{value}</b>
      {label}
    </div>
  );
}

export function RunHeader({ prUrl, prTitle, stats, issueCount, apiCalls, onBackToHistory }: RunHeaderProps) {
  const { repo, num } = prUrl ? splitUrl(prUrl) : { repo: '', num: '' };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '11px 16px', borderBottom: '1px solid var(--bd)',
      background: 'var(--sub)', flex: '0 0 auto',
    }}>
      <button
        onClick={onBackToHistory}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontFamily: MONO, fontSize: 10.5, color: 'var(--t5)',
          border: '1px solid var(--bd2)', borderRadius: 5,
          padding: '4px 8px', cursor: 'pointer', background: 'transparent',
          flexShrink: 0,
        }}
      >
        <span>←</span><span>History</span>
      </button>

      {repo && (
        // The repo/number pair is the one reliable way back to the source of
        // truth, so it stays a real link rather than decorative text.
        <a
          href={prUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
        >
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: 'var(--accent)' }}>{repo}</span>
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: 'var(--t8)' }}>{num}</span>
        </a>
      )}

      <span style={{
        fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em',
        minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {prTitle || 'Untitled PR'}
      </span>

      <div style={{ flex: 1 }} />

      {stats && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <StatChip value={stats.totalNodes} label="nodes" />
          <StatChip value={stats.totalEdges} label="edges" />
          {/* The mock counts API calls here, not AI findings. It is the more
              useful number: AI findings are already the triage list's subject,
              and with the review opt-in this chip would usually read 0. */}
          <StatChip value={apiCalls} label="api calls" />
          <StatChip value={issueCount} label="issues" tone={issueCount > 0 ? 'warn' : 'neutral'} />
        </div>
      )}
    </div>
  );
}
