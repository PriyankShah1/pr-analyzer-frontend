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
          display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
          background: 'transparent', border: 0, padding: '2px 0', textAlign: 'left',
          fontSize: 12, color,
        }}
      >
        <span style={{ width: 9, display: 'inline-block', fontSize: 10 }}>{open ? '▾' : '▸'}</span>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, opacity: 0.8 }}>({findings.length})</span>
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', paddingLeft: 16 }}>
          {findings.map(f => (
            <div
              key={f.fingerprint}
              style={{
                display: 'flex', gap: 14, alignItems: 'baseline',
                padding: '4px 0', borderBottom: '1px solid var(--line)',
              }}
            >
              <span style={{
                width: 4, height: 4, borderRadius: '50%', background: color,
                flex: '0 0 4px', alignSelf: 'center', opacity: 0.7,
              }} />
              <span style={{ fontSize: 12.5, color: 'var(--t2)', lineHeight: 1.5, minWidth: 0, flex: 1 }}>
                {f.title}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--t6)', flexShrink: 0 }}>
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
    ? `First review — ${diff.counts.persisting} finding${diff.counts.persisting === 1 ? '' : 's'} to start from`
    : [
        diff.counts.regressed  > 0 ? `${diff.counts.regressed} came back`   : null,
        diff.counts.introduced > 0 ? `${diff.counts.introduced} new`        : null,
        diff.counts.resolved   > 0 ? `${diff.counts.resolved} fixed`        : null,
        diff.counts.persisting > 0 ? `${diff.counts.persisting} still open` : null,
      ].filter(Boolean).join(' · ') || 'Nothing changed since the previous revision';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 9,
      padding: '13px 16px',
      borderLeft: `3px solid ${isLatest ? 'var(--accent)' : 'var(--bd2)'}`,
      background: isLatest ? 'var(--sel-bg)' : 'transparent',
      borderRadius: '0 6px 6px 0',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--t1)' }}>
          Revision {rev.index}
        </span>
        <span style={{
          fontFamily: MONO, fontSize: 11, color: 'var(--accent)',
          background: 'var(--chip)', border: '1px solid var(--bd2)',
          borderRadius: 4, padding: '2px 6px',
        }}>
          {short(snapshot.sha)}
        </span>
        {!diff.isFirstReview && (
          <span style={{ fontSize: 11.5, color: 'var(--t6)' }}>
            compared with {short(diff.previousSha)}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--t7)' }}>
          {relativeTime(snapshot.reviewedAt)}
        </span>
      </div>

      {/* The one-line verdict for this push, stated before the detail so the
          shape of the revision reads without expanding anything. */}
      <div style={{ fontSize: 13, color: 'var(--t2)', fontWeight: 500 }}>{headline}</div>

      {/* Ordered by what a reviewer needs to know first. A risk that came back
          matters more than a new one, which matters more than progress. */}
      <Bucket label="Came back — was fixed earlier" color="var(--sev1)"
        findings={diff.regressed} defaultOpen />
      <Bucket label="New in this revision" color="var(--sev2)"
        findings={diff.introduced} defaultOpen />
      <Bucket label="Fixed in this revision" color="var(--ok)"
        findings={diff.resolved} defaultOpen={isLatest} />
      <Bucket label="Still open" color="var(--t5)" findings={diff.persisting} />
    </div>
  );
}

interface ReviewHistoryProps {
  prUrl?: string;
  /** Changes when a new revision has been recorded. Without it this memo keys
   *  only on the URL, so a refresh that stored a new snapshot left the history
   *  showing the revisions from before it. */
  refreshKey?: number;
  /** The diff for the run currently on screen, which may not be recorded yet. */
  currentDiff?: RiskDiff | null;
}

export function ReviewHistory({ prUrl, refreshKey = 0 }: ReviewHistoryProps) {
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
  }, [prUrl, refreshKey]);

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
        padding: '10px 16px', borderBottom: '1px solid var(--line)',
        fontFamily: MONO, fontSize: 11, color: 'var(--t6)',
      }}>
        <span style={{ color: 'var(--t3)' }}>
          {total} revision{total === 1 ? '' : 's'} reviewed
        </span>
        <span style={{ color: 'var(--ok)' }}>{fixedAllTime} fixed so far</span>
        <span style={{ color: 'var(--t5)' }}>
          {latest.snapshot.findings.length} still open at {short(latest.snapshot.sha)}
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
