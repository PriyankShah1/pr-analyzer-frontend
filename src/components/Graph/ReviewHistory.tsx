// src/components/Graph/ReviewHistory.tsx
//
// The revision-by-revision record of a PR: what each push fixed, what it left
// open, what it introduced, and what came back.
//
// The re-review strip could already say "3 fixed · 13 still open", but a count
// alone is not trackable — a reviewer needs to know WHICH three, and to be
// able to look back at the revision before. Every piece of that was already
// stored (riskRegistry keeps up to 10 snapshots per PR, each with its full
// finding list); nothing rendered it.
//
// Diffs are recomputed here with the same pure `computeRiskDiff` the workspace
// uses, rather than stored alongside the snapshots. Storing them would let a
// snapshot and its diff drift apart after a schema change; deriving them means
// the history can never disagree with the live view.

import { useMemo, useState } from 'react';
import type { Finding, ReviewSnapshot, RiskDiff } from '../../types/risk';
import { computeRiskDiff } from '../../services/riskDiff';
import { getSnapshots, parseRepoAndNumber } from '../../services/riskRegistry';
import { relativeTime } from '../../utils/runSummary';

const MONO = 'var(--font-mono)';

interface Revision {
  index: number;          // 1-based, oldest first
  snapshot: ReviewSnapshot;
  diff: RiskDiff;
}

function short(sha: string | null | undefined) {
  return sha ? String(sha).slice(0, 7) : '—';
}

function Bucket({ label, color, findings, defaultOpen = false }: {
  label: string; color: string; findings: Finding[]; defaultOpen?: boolean;
}) {
  // Long lists start collapsed: the point of this view is the CHANGE, and 13
  // unchanged findings would bury the three that moved.
  const [open, setOpen] = useState(defaultOpen);
  if (findings.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          background: 'transparent', border: 0, padding: 0, textAlign: 'left',
          fontFamily: MONO, fontSize: 10, color,
        }}
      >
        <span style={{ width: 8, display: 'inline-block' }}>{open ? '▾' : '▸'}</span>
        <span style={{ fontWeight: 600 }}>{findings.length}</span>
        <span>{label}</span>
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 14 }}>
          {findings.map(f => (
            <div key={f.fingerprint} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <span style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.5, minWidth: 0, flex: 1 }}>
                {f.title}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--t6)', flexShrink: 0 }}>
                {f.file}{f.line ? `:${f.line}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RevisionBlock({ rev, isLatest }: { rev: Revision; isLatest: boolean }) {
  const { diff, snapshot } = rev;

  const headline = diff.isFirstReview
    ? `baseline — ${diff.counts.persisting} finding${diff.counts.persisting === 1 ? '' : 's'}`
    : [
        diff.counts.regressed  > 0 ? `${diff.counts.regressed} regressed`   : null,
        diff.counts.introduced > 0 ? `${diff.counts.introduced} new`        : null,
        diff.counts.resolved   > 0 ? `${diff.counts.resolved} fixed`        : null,
        diff.counts.persisting > 0 ? `${diff.counts.persisting} still open` : null,
      ].filter(Boolean).join(' · ') || 'no change';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 7,
      padding: '10px 12px',
      borderLeft: `2px solid ${isLatest ? 'var(--accent)' : 'var(--bd2)'}`,
      background: isLatest ? 'var(--sel-bg)' : 'transparent',
      borderRadius: '0 6px 6px 0',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, color: 'var(--t2)' }}>
          rev {rev.index}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--accent)' }}>
          {short(snapshot.sha)}
        </span>
        {!diff.isFirstReview && (
          <span style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--t7)' }}>
            since {short(diff.previousSha)}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--t7)' }}>
          {relativeTime(snapshot.reviewedAt)}
        </span>
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--t3)' }}>{headline}</div>

      {/* Ordered by what a reviewer needs to know first. A risk that came back
          matters more than a new one, which matters more than progress. */}
      <Bucket label="regressed — fixed earlier, back again" color="var(--sev1)"
        findings={diff.regressed} defaultOpen />
      <Bucket label="new in this revision" color="var(--sev2)"
        findings={diff.introduced} defaultOpen />
      <Bucket label="fixed in this revision" color="var(--ok)"
        findings={diff.resolved} defaultOpen={isLatest} />
      <Bucket label="still open" color="var(--t5)" findings={diff.persisting} />
    </div>
  );
}

interface ReviewHistoryProps {
  prUrl?: string;
  /** The diff for the run currently on screen, which may not be recorded yet. */
  currentDiff?: RiskDiff | null;
}

export function ReviewHistory({ prUrl }: ReviewHistoryProps) {
  const revisions = useMemo<Revision[]>(() => {
    const ids = prUrl ? parseRepoAndNumber(prUrl) : null;
    if (!ids) return [];

    const snapshots = getSnapshots(ids.repo, ids.prNumber);   // oldest first

    return snapshots.map((snapshot, i) => ({
      index: i + 1,
      snapshot,
      diff: computeRiskDiff(
        i === 0 ? null : snapshots[i - 1],
        { sha: snapshot.sha, findings: snapshot.findings },
      ),
    }));
  }, [prUrl]);

  if (revisions.length === 0) {
    return (
      <div style={{ padding: '14px 13px', fontSize: 11.5, color: 'var(--t5)', lineHeight: 1.6 }}>
        No review history for this PR yet. Analyze it, then hit Refresh after a
        push — each revision is recorded here with what it fixed and what it left open.
      </div>
    );
  }

  const total = revisions.length;
  const latest = revisions[total - 1];
  const fixedAllTime = latest.snapshot.resolvedFingerprints.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '9px 13px', borderBottom: '1px solid var(--line)',
        fontFamily: MONO, fontSize: 10, color: 'var(--t6)',
      }}>
        <span>{total} revision{total === 1 ? '' : 's'} recorded</span>
        <span style={{ color: 'var(--ok)' }}>{fixedAllTime} fixed and still fixed</span>
        <span style={{ color: 'var(--t5)' }}>
          {latest.snapshot.findings.length} open at {short(latest.snapshot.sha)}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ color: 'var(--t7)' }}>newest first</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px' }}>
        {[...revisions].reverse().map(rev => (
          <RevisionBlock key={rev.snapshot.sha + rev.index} rev={rev} isLatest={rev.index === total} />
        ))}
      </div>
    </div>
  );
}
