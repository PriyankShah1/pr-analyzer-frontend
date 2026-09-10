// src/components/History/HistoryBoard.tsx
// The PR tracking board (§5) — built on the History view from the Claude
// Design handoff: filters, four rollup stat cards, and a grid of PR tiles.
//
// One tile per PR, not per run. Each tile carries the health rollup the
// registry can answer (open critical / high / resolved) and a Refresh that
// re-analyzes at the latest commit and reports what moved.
//
// Every value shown is DERIVED FROM A REAL STORED RUN. The mock ships sample
// rows with invented metrics; wiring those through as-is would produce a
// dashboard that looks informative and reports nothing. Where a real run has
// no value for a field (an older entry stored before v6 added risk counts),
// the tile degrades rather than inventing a number.

import { useMemo, useState } from 'react';
import type { PRHistoryItem } from '../../types';
import type { RiskDiff } from '../../types/risk';
import { buildBoard, rollup, type PRBoardRow } from '../../services/prBoard';
import {
  splitUrl, relativeTime, issueCount, verdictOf, VERDICT_COLOR,
  type Verdict,
} from '../../utils/runSummary';

const FILTERS = ['All', 'With issues', 'Clean', 'Out of scope'] as const;
type Filter = typeof FILTERS[number];

const FILTER_TO_VERDICT: Record<string, Verdict | undefined> = {
  'With issues': 'issues',
  Clean: 'clean',
  'Out of scope': 'scope',
};

const MONO = 'var(--font-mono)';

/** What a Refresh found. The board renders this; App produces it. */
export interface RefreshOutcome {
  ok: boolean;
  /** Set when ok is false. */
  error?: string;
  /**
   * Whether the PR's head commit moved since the stored run.
   *
   * Tri-state on purpose. A boolean would collapse "same commit" and "neither
   * SHA is known" into one false, and the tile would then report "no push
   * since last run" about a PR whose commits it cannot see at all.
   */
  commit: 'new' | 'same' | 'unknown';
  sha: string | null;
  /** Null when the PR has no head SHA, so no comparison is possible. */
  diff: RiskDiff | null;
}

type RefreshState =
  | { phase: 'running' }
  | { phase: 'done'; outcome: RefreshOutcome };

interface RunRow extends PRBoardRow {
  num: string;
  lang: string;
  verdict: Verdict;
  issues: number;
  nodes: number;
  edges: number;
  apis: number;
  when: string;
}

function toRow(row: PRBoardRow): RunRow {
  const { num } = splitUrl(row.url);
  const stats: any = row.item.result?.visualization?.stats ?? {};
  const apis = (row.item.result?.flows ?? []).filter((f: any) => f.type === 'api_call').length;

  return {
    ...row,
    num: num || (row.prNumber !== null ? `#${row.prNumber}` : ''),
    lang: row.item.result?.language || 'unknown',
    verdict: verdictOf(row.item),
    issues: issueCount(row.item),
    nodes: stats.totalNodes ?? 0,
    edges: stats.totalEdges ?? 0,
    apis,
    when: relativeTime(row.analyzedAt),
  };
}

function StatCard({ label, value, note, color }: {
  label: string; value: number; note: string; color: string;
}) {
  return (
    <div style={{
      flex: 1, minWidth: 170, display: 'flex', flexDirection: 'column', gap: 5,
      padding: '13px 15px', background: 'var(--panel)',
      border: '1px solid var(--bd)', borderRadius: 10,
    }}>
      <div style={{
        fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.09em',
        color: 'var(--t6)', textTransform: 'uppercase',
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color }}>{value}</span>
        <span style={{ fontSize: 11, color: 'var(--t6)' }}>{note}</span>
      </div>
    </div>
  );
}

function Metric({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: color ?? 'var(--t2)' }}>
        {value}
      </span>
      <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.05em', color: 'var(--t6)' }}>
        {label}
      </span>
    </div>
  );
}

/**
 * The per-PR health line.
 *
 * `resolved: null` means the PR was never recorded in the registry (no head
 * SHA), so nothing is comparable — that reads as "not tracked", never as a
 * zero, which would claim nothing has ever been fixed.
 */
function HealthRow({ row }: { row: RunRow }) {
  const h = row.health;
  const nothingOpen = h.openCritical === 0 && h.openHigh === 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      {h.openCritical > 0 && <Metric value={h.openCritical} label="critical" color="var(--sev1)" />}
      {h.openHigh > 0 && <Metric value={h.openHigh} label="high" color="var(--sev2)" />}
      {nothingOpen && (
        <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.05em', color: 'var(--t6)' }}>
          no critical or high
        </span>
      )}
      {h.resolved !== null && h.resolved > 0 && (
        <Metric value={h.resolved} label="resolved" color="var(--ok)" />
      )}
      <div style={{ flex: 1 }} />
      <span
        title={h.tracked
          ? `${h.reviewCount} revision${h.reviewCount === 1 ? '' : 's'} recorded — latest ${h.latestReviewedSha?.slice(0, 7)}`
          : 'Not tracked across revisions — this run reported no head commit, so nothing can be compared'}
        style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--t7)' }}
      >
        {h.tracked ? `${h.reviewCount} rev${h.reviewCount === 1 ? '' : 's'}` : 'untracked'}
      </span>
    </div>
  );
}

/** Buckets from a completed Refresh: what moved since the stored review. */
function RefreshStrip({ state }: { state: RefreshState }) {
  if (state.phase === 'running') {
    return (
      <div style={{
        fontFamily: MONO, fontSize: 10, color: 'var(--t5)',
        background: 'var(--chip)', border: '1px solid var(--bd2)',
        borderRadius: 6, padding: '6px 8px',
      }}>
        Re-analyzing at latest commit…
      </div>
    );
  }

  const { outcome } = state;

  if (!outcome.ok) {
    return (
      <div style={{
        fontFamily: MONO, fontSize: 10, color: 'var(--sev1)',
        border: '1px solid var(--bd2)', borderRadius: 6, padding: '6px 8px',
      }}>
        {outcome.error}
      </div>
    );
  }

  const d = outcome.diff;
  const sha = outcome.sha ? outcome.sha.slice(0, 7) : null;

  // No SHA means the backend returned a result the registry cannot key on, so
  // there is no baseline and no comparison — say that instead of showing four
  // zeroes that would read as "nothing changed".
  const summary = !d
    ? 'Re-analyzed — no commit SHA, so revisions cannot be compared'
    : d.isFirstReview
      ? 'First tracked revision — nothing to compare against yet'
      : [
          d.counts.regressed  > 0 ? `${d.counts.regressed} regressed`   : null,
          d.counts.introduced > 0 ? `${d.counts.introduced} new`        : null,
          d.counts.resolved   > 0 ? `${d.counts.resolved} fixed`        : null,
          d.counts.persisting > 0 ? `${d.counts.persisting} still open` : null,
        ].filter(Boolean).join(' · ') || 'No change since the last review';

  const tone = d && !d.isFirstReview && (d.counts.regressed > 0 || d.counts.introduced > 0)
    ? 'var(--sev2)'
    : d && d.counts.resolved > 0 ? 'var(--ok)' : 'var(--t5)';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 3,
      fontFamily: MONO, fontSize: 10, color: tone,
      background: 'var(--chip)', border: '1px solid var(--bd2)',
      borderRadius: 6, padding: '6px 8px',
    }}>
      <span>{summary}</span>
      <span style={{ color: 'var(--t7)' }}>
        {outcome.commit === 'new'
          ? `new commit ${sha}`
          : outcome.commit === 'same'
            ? `same commit ${sha} — no push since last run`
            : 'commit unknown — cannot tell whether anything was pushed'}
      </span>
    </div>
  );
}

function RunTile({ row, active, onOpen, onCopy, copied, onRefresh, refreshState }: {
  row: RunRow; active: boolean; onOpen: () => void; onCopy: () => void; copied: boolean;
  onRefresh: () => void; refreshState?: RefreshState;
}) {
  const v = VERDICT_COLOR[row.verdict];
  const verdictLabel = row.verdict === 'issues'
    ? `${row.issues} ${row.issues === 1 ? 'issue' : 'issues'}`
    : row.verdict === 'clean' ? 'no issues found' : 'out of detection scope';

  const refreshing = refreshState?.phase === 'running';

  return (
    <div
      onClick={onOpen}
      style={{
        display: 'flex', flexDirection: 'column', gap: 9,
        padding: '14px 15px', borderRadius: 11, cursor: 'pointer',
        background: 'var(--panel)', boxShadow: 'var(--shadow)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--bd)'}`,
        transition: 'border-color .15s, box-shadow .15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: v.dot, flex: '0 0 7px' }} />
        <span style={{
          fontFamily: MONO, fontSize: 11.5, fontWeight: 500, color: 'var(--t1)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {row.repo}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--t6)', flex: '0 0 auto' }}>
          {row.num}
        </span>
      </div>

      <div style={{ fontSize: 12.5, color: 'var(--t2)', lineHeight: 1.45, minHeight: 36 }}>
        {row.title}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: MONO, fontSize: 9.5, color: 'var(--t4)', background: 'var(--chip)',
          border: '1px solid var(--bd2)', borderRadius: 4, padding: '3px 6px',
        }}>
          {row.lang}
        </span>
        <span style={{
          fontFamily: MONO, fontSize: 9.5, color: v.fg,
          border: `1px solid ${v.fg}55`,
          background: row.verdict === 'scope' ? 'var(--chip)' : `${v.fg}14`,
          borderRadius: 4, padding: '3px 6px',
        }}>
          {verdictLabel}
        </span>
        {/* 'unknown' is stored when GitHub did not report a state; showing it
            as a chip would dress a gap up as a fact. */}
        {row.state && row.state !== 'unknown' && (
          <span style={{
            fontFamily: MONO, fontSize: 9.5, color: 'var(--t4)', background: 'var(--chip)',
            border: '1px solid var(--bd2)', borderRadius: 4, padding: '3px 6px',
          }}>
            {row.state}
          </span>
        )}
        {row.author && (
          <span style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--t6)', padding: '3px 2px' }}>
            @{row.author}
          </span>
        )}
      </div>

      <div style={{ height: 1, background: 'var(--div)' }} />

      <HealthRow row={row} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Metric value={row.nodes} label="nodes" />
        <Metric value={row.edges} label="edges" />
        <Metric value={row.apis} label="api" />
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--t7)' }}>{row.when}</span>
      </div>

      {refreshState && <RefreshStrip state={refreshState} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <div style={{
          fontFamily: MONO, fontSize: 10, borderRadius: 5, padding: '5px 8px',
          color: active ? 'var(--t6)' : 'var(--info-fg)',
          background: active ? 'transparent' : 'var(--info-bg)',
          border: `1px solid ${active ? 'var(--bd2)' : 'var(--info-bd)'}`,
        }}>
          {active ? 'Currently open' : 'Open analysis →'}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onRefresh(); }}
          disabled={refreshing}
          title="Re-analyze this PR at its latest commit and compare against the stored review"
          style={{
            fontFamily: MONO, fontSize: 10, color: refreshing ? 'var(--t7)' : 'var(--t5)',
            border: '1px solid var(--bd2)', background: 'transparent',
            borderRadius: 5, padding: '5px 8px',
            cursor: refreshing ? 'default' : 'pointer',
          }}
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <button
          onClick={e => { e.stopPropagation(); onCopy(); }}
          style={{
            fontFamily: MONO, fontSize: 10, color: copied ? 'var(--ok)' : 'var(--t6)',
            border: `1px solid ${copied ? 'var(--ok)' : 'var(--bd2)'}`,
            background: 'transparent', borderRadius: 5, padding: '5px 8px', cursor: 'pointer',
          }}
        >
          {copied ? 'Copied' : 'Copy URL'}
        </button>
      </div>
    </div>
  );
}

interface HistoryBoardProps {
  history: PRHistoryItem[];
  activeHistoryId: string | null;
  onOpen: (item: PRHistoryItem) => void;
  onClear: () => void;
  onRefresh: (item: PRHistoryItem) => Promise<RefreshOutcome>;
  maxHistory?: number;
}

export function HistoryBoard({
  history, activeHistoryId, onOpen, onClear, onRefresh, maxHistory = 20,
}: HistoryBoardProps) {
  const [filter, setFilter] = useState<Filter>('All');
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [refreshes, setRefreshes] = useState<Record<string, RefreshState>>({});

  // Rebuilt whenever history changes — a completed refresh writes back to
  // history, so the tile's counts and its refresh strip stay in step.
  const rows = useMemo(() => buildBoard(history).map(toRow), [history]);
  const totals = useMemo(() => rollup(rows), [rows]);

  const wanted = FILTER_TO_VERDICT[filter];
  const visible = wanted ? rows.filter(r => r.verdict === wanted) : rows;

  const copy = (row: RunRow) => {
    navigator.clipboard?.writeText(row.url).then(
      () => {
        setCopiedId(row.id);
        setTimeout(() => setCopiedId(prev => (prev === row.id ? null : prev)), 1500);
      },
      () => { /* clipboard blocked — leave the label unchanged rather than lie */ },
    );
  };

  const refresh = async (row: RunRow) => {
    if (refreshes[row.id]?.phase === 'running') return;
    setRefreshes(prev => ({ ...prev, [row.id]: { phase: 'running' } }));
    try {
      const outcome = await onRefresh(row.item);
      setRefreshes(prev => ({ ...prev, [row.id]: { phase: 'done', outcome } }));
    } catch (err: any) {
      setRefreshes(prev => ({
        ...prev,
        [row.id]: {
          phase: 'done',
          outcome: {
            ok: false,
            error: err?.message || 'Refresh failed',
            commit: 'unknown', sha: null, diff: null,
          },
        },
      }));
    }
  };

  return (
    <div style={{
      flex: 1, minHeight: 0, overflowY: 'auto',
      padding: '26px 30px 40px', background: 'var(--bg)',
    }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--t1)' }}>
              Tracked pull requests
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--t5)', lineHeight: 1.5 }}>
              Last {maxHistory} PRs analyzed, newest first. Stateless service — this board lives
              in your browser and clears when you clear site data. Refresh re-analyzes on demand;
              nothing polls in the background.
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            {FILTERS.map(f => {
              const active = filter === f;
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: '6px 11px', borderRadius: 6, cursor: 'pointer', fontSize: 11.5,
                    fontFamily: 'var(--font-sans)',
                    background: active ? 'var(--sel-bg)' : 'var(--panel)',
                    border: `1px solid ${active ? 'var(--sel-bd)' : 'var(--bd)'}`,
                    color: active ? 'var(--t1)' : 'var(--t5)',
                  }}
                >
                  {f}
                </button>
              );
            })}
            {history.length > 0 && (
              <button
                onClick={() => {
                  if (confirmingClear) { onClear(); setConfirmingClear(false); }
                  else setConfirmingClear(true);
                }}
                onBlur={() => setConfirmingClear(false)}
                title="Remove every stored run from this browser"
                style={{
                  padding: '6px 11px', borderRadius: 6, cursor: 'pointer', fontSize: 11.5,
                  fontFamily: 'var(--font-sans)', background: 'transparent',
                  border: `1px solid ${confirmingClear ? 'var(--sev1)' : 'var(--bd)'}`,
                  color: confirmingClear ? 'var(--sev1)' : 'var(--t6)',
                }}
              >
                {confirmingClear ? 'Click again to confirm' : 'Clear all'}
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <StatCard
            label="PRs tracked"
            value={totals.prs}
            note={`of ${maxHistory}`}
            color="var(--t1)"
          />
          <StatCard
            label="Open critical"
            value={totals.openCritical}
            note={totals.openCritical === 0 ? 'none outstanding' : 'across all PRs'}
            color={totals.openCritical > 0 ? 'var(--sev1)' : 'var(--t1)'}
          />
          <StatCard
            label="Open high"
            value={totals.openHigh}
            note={totals.openHigh === 0 ? 'none outstanding' : 'across all PRs'}
            color={totals.openHigh > 0 ? 'var(--sev2)' : 'var(--t1)'}
          />
          <StatCard
            label="Resolved"
            value={totals.resolved}
            note={totals.tracked === 0 ? 'no tracked revisions yet' : 'fixed and still fixed'}
            color="var(--ok)"
          />
        </div>

        {rows.length === 0 ? (
          <div style={{
            border: '1px dashed var(--bd2)', borderRadius: 10, background: 'var(--canvas)',
            padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 9, textAlign: 'center',
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9, border: '1px solid var(--bd2)',
              background: 'var(--chip)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 15, color: 'var(--t5)',
            }}>
              ∅
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t2)' }}>No PRs tracked yet</div>
            <div style={{ fontSize: 12.5, color: 'var(--t5)', lineHeight: 1.6, maxWidth: 420 }}>
              Paste a GitHub PR URL in the header and hit Analyze. Every PR is stored here
              so you can jump back to it, or refresh it against its latest commit.
            </div>
          </div>
        ) : visible.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--t5)', padding: '20px 2px' }}>
            No PRs match “{filter}”.
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(292px, 1fr))',
            gap: 12,
          }}>
            {visible.map(row => (
              <RunTile
                key={row.id}
                row={row}
                active={row.id === activeHistoryId}
                onOpen={() => onOpen(row.item)}
                onCopy={() => copy(row)}
                copied={copiedId === row.id}
                onRefresh={() => refresh(row)}
                refreshState={refreshes[row.id]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
