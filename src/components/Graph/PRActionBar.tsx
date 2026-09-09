// src/components/Graph/PRActionBar.tsx
// The four actions you can take on the PR you are looking at.
//
//   In-depth review · Post comments · Suggest fixes · Refresh
//
// PLACEMENT: this bar belongs to the PR, so it sits under the run header and
// above the triage list. Not in the global header — that is chrome for the
// whole app and says nothing about any one PR. Not inside the triage panel —
// these act on the PR, not on the issue list, and two of them write to the
// repository.
//
// SAFETY: the first click on a write action always DRY RUNS. A second,
// separate click confirms. There is no path from one click to a write, in this
// component or in the backend (routes/comment.js, routes/commit.js).

import { useEffect, useState } from 'react';
import axios from 'axios';
import type { Finding } from '../../types/risk';
import { ReviewHistory } from './ReviewHistory';
import {
  PR_BAR, PR_VIEWS,
  type PRActionCtx, type PRViewCtx, type PRViewDef,
} from './prViews';

const API = import.meta.env.VITE_API_URL;
const MONO = 'var(--font-mono)';

type Mode = 'comment' | 'commit';

/** null = the graph. Otherwise the bar has taken over the column. */
export type PanelTab = 'post' | 'history' | 'fixes' | null;

interface PlannedComment {
  fingerprint: string;
  path: string;
  line: number | null;
  title: string;
  severity: string;
  body: string;
  defaultDetail: string;
}

interface Resolution {
  fingerprint: string;
  title: string;
  path: string | null;
  /** Direct link to the comment on GitHub. */
  url?: string | null;
}

interface OnPREntry {
  fingerprint: string;
  title: string;
  path: string;
  line: number | null;
  url?: string | null;
  status: 'commented' | 'resolved';
  canResolve: boolean;
  stillFound: boolean;
  /** Body was edited to read "Resolved" by an older version, but GitHub still
   *  considers the thread open. Shown as open, because GitHub is the truth. */
  legacyResolvedNote?: boolean;
}

interface Preview {
  mode: Mode;
  message: string;
  /** The standing record: every finding this review has put on the PR. */
  onPR: OnPREntry[];
  comments: PlannedComment[];
  /** Comments already on the PR whose finding is now fixed — these get edited
   *  in place to "Resolved". A write with nothing to select. */
  resolutions: Resolution[];
  /** Already marked resolved on an earlier run — shown so the claim is
   *  checkable, since an edited inline comment is easy to lose in a long diff. */
  alreadyResolved: Resolution[];
  /** True when confirming would put a summary on the PR — including restoring
   *  one that was deleted. Counts as a write on its own. */
  willPostSummary: boolean;
  /** How many summary comments the PR carries. More than one is a leftover
   *  from before summaries were refreshed in place. */
  summaryCount: number;
  detail: string[];
  rejected: Array<{ fingerprint: string; reason: string }>;
}

interface PRActionBarProps {
  /** Tour anchor, set on the root so no wrapper element is needed. */
  dataTour?: string;
  prUrl?: string;
  token: string;
  risks: Finding[];
  /** Whether this analysis already included the in-depth review. */
  aiReviewRan?: boolean;
  onRunInDepth: () => void;
  inDepthRunning?: boolean;
  onReanalyze: () => void;
  reanalyzing?: boolean;
  /** True for the demo PR, whose dry runs need no token. */
  tokenOptional?: boolean;
  onNeedToken?: () => void;
  /** Bumped when something elsewhere (the re-review strip) asks for the
   *  history. A counter rather than a boolean so repeat requests re-open it. */
  historyRequest?: number;
  /** Which full-height view is open; null shows the graph. Owned by the parent
   *  because opening one replaces the triage list and canvas. */
  panelTab: PanelTab;
  onPanelTabChange: (tab: PanelTab) => void;
  /** Minutes between automatic checks; 0 is off. */
  autoMinutes?: number;
  onAutoMinutesChange?: (minutes: number) => void;
  /** Set when an automatic check found a new commit. */
  changeNotice?: { sha: string; summary: string; at: number } | null;
  onDismissNotice?: () => void;
  /** Bumped when a run is adopted. An open dry run describes the state BEFORE
   *  the refresh, so it is re-fetched rather than left to mislead. */
  dataVersion?: number;
  /**
   * Something was written. The MODE matters: committing a fix changes the code
   * and needs a fresh analysis, posting a comment does not — re-analyzing after
   * a comment blanked the whole workspace for no reason.
   */
  onDone: (mode: Mode) => void;
}

function btn(tone: 'ghost' | 'accent' | 'danger' | 'on'): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    fontFamily: MONO, fontSize: 10.5, borderRadius: 6, padding: '6px 10px',
    cursor: 'pointer', whiteSpace: 'nowrap',
  };
  if (tone === 'accent') return { ...base, color: 'var(--info-fg)', background: 'var(--info-bg)', border: '1px solid var(--info-bd)' };
  if (tone === 'danger') return { ...base, color: 'var(--on-accent)', background: 'var(--sev2)', border: '1px solid var(--sev2)' };
  if (tone === 'on') return { ...base, color: 'var(--t1)', background: 'var(--sel-bg)', border: '1px solid var(--sel-bd)' };
  return { ...base, color: 'var(--t4)', background: 'var(--input)', border: '1px solid var(--bd2)' };
}

export function PRActionBar({
  dataTour,
  prUrl, token, risks, aiReviewRan, onRunInDepth, inDepthRunning,
  onReanalyze, reanalyzing, tokenOptional, onNeedToken, onDone,
  historyRequest = 0, panelTab, onPanelTabChange,
  autoMinutes = 0, onAutoMinutesChange, changeNotice, onDismissNotice,
  dataVersion = 0,
}: PRActionBarProps) {
  const setPanelTab = onPanelTabChange;

  // Which registry view is open, and which of its tabs. panelTab carries both:
  // a view id, or a tab key belonging to one. Kept as one value so the parent
  // needs to know only "is a view open" to decide whether to show the graph.
  const openView: PRViewDef | null = panelTab
    ? PR_VIEWS.find(v => v.id === panelTab || v.tabs?.some(t => t.key === panelTab)) ?? null
    : null;
  const activeTab = openView?.tabs
    ? (openView.tabs.some(t => t.key === panelTab) ? panelTab : openView.tabs[0].key)
    : null;
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  // Tracked as EXCLUSIONS, so a comment that shows up in a later dry run is on
  // by default. An inclusion set would silently drop findings never seen.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  // Fingerprints already posted individually during this preview.
  const [posted, setPosted] = useState<Set<string>>(new Set());
  // Per-row failures, so a comment GitHub rejected can be retried on its own
  // rather than forcing a fresh dry run of all of them.
  const [failed, setFailed] = useState<Record<string, string>>({});

  /**
   * Which full-height view the bar is showing, or null for the graph.
   *
   * Lifted to FlowVisualization because opening one REPLACES the triage list
   * and canvas rather than sitting above them. A list of sixteen comments,
   * each with an editable body, cannot be read through a 460px slot; and the
   * graph and the comment list are wanted at different moments — one to
   * understand the change, the other to manage the review — so neither needs
   * to be squeezed for the other.
   */

  // Asked for from elsewhere — the re-review strip's "which ones?". A counter,
  // so asking twice re-opens the panel rather than being swallowed by a
  // boolean that was already true.
  // A refresh invalidates an open plan: it was computed against the previous
  // revision, so its comment list and resolutions describe a PR that has moved.
  useEffect(() => {
    if (dataVersion === 0) return;
    if (panelTab === 'post' && !needsToken) void call('comment', false);
    if (panelTab === 'fixes' && !needsToken) void call('commit', false);
    // Only the version matters; re-running on the other values would refetch
    // on every keystroke in a comment editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion]);

  useEffect(() => {
    if (historyRequest > 0) onPanelTabChange('history');
    // onPanelTabChange is a setter; re-running on its identity would reopen
    // the panel on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyRequest]);

  // Only anchored findings have a verified position — to comment on or patch.
  const anchored = risks.filter(r => r.anchored);

  // A dry run writes nothing, so the demo can preview without a token. A
  // confirm always needs one; the backend enforces that independently.
  const needsToken = !token.trim() && !tokenOptional;

  const call = async (
    mode: Mode,
    confirm: boolean,
    only?: string[],
  ) => {
    if (!prUrl) return;
    setBusy(only ? `one:${only[0]}` : mode);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        url: prUrl, token, confirm, aiReview: aiReviewRan === true,
      };

      if (mode === 'comment') {
        if (Object.keys(edits).length > 0) body.edits = edits;
        if (only) body.fingerprints = only;
        else if (excluded.size > 0 && preview) {
          body.fingerprints = preview.comments
            .map(c => c.fingerprint)
            .filter(fp => !excluded.has(fp) && !posted.has(fp));
        } else if (posted.size > 0 && preview) {
          body.fingerprints = preview.comments
            .map(c => c.fingerprint)
            .filter(fp => !posted.has(fp));
        }
      }
      if (mode === 'commit') {
        body.fingerprints = anchored.slice(0, 10).map(r => r.fingerprint);
      }

      const res = await axios.post(`${API}/${mode}`, body);
      const d = res.data;

      if (!confirm) {
        setPosted(new Set());
        setFailed({});
        setPreview({
          mode,
          message: d.message ?? 'Nothing to do.',
          comments: mode === 'comment' ? (d.plan?.inlineComments ?? []) : [],
          resolutions: mode === 'comment' ? (d.plan?.resolutions ?? []) : [],
          alreadyResolved: mode === 'comment' ? (d.plan?.alreadyResolved ?? []) : [],
          onPR: mode === 'comment' ? (d.onPR ?? []) : [],
          willPostSummary: Boolean(d.plan?.counts?.willPostSummary),
          summaryCount: Number(d.summaryCount ?? 0),
          detail: mode === 'commit' ? (d.patches ?? []).map((p: any) => `${p.file} — ${p.title}`) : [],
          rejected: (mode === 'comment' ? [] : d.rejected) ?? [],
        });
      } else if (only) {
        // Trust the server's COUNT, not the 2xx. A review can come back OK
        // having posted only a fallback summary (a stale position, say), and
        // marking the row "posted" then would claim an inline comment exists
        // on GitHub when it does not.
        const fp = only[0];
        // "Already on the PR" counts as done. The server only reports it after
        // reading the marker back out of a real GitHub comment, so the comment
        // demonstrably exists — treating that as a failure told the user their
        // post had not worked when it had.
        const wasAlready = (d.alreadyPosted ?? []).some((a: any) => a.fingerprint === fp);
        if ((d.posted?.postedInline ?? 0) > 0 || wasAlready) {
          setFailed(prev => { const n = { ...prev }; delete n[fp]; return n; });
          if (wasAlready) setDone('Already on this PR — not duplicated.');
          // Keep the panel open so the rest can be handled individually —
          // closing here would make posting three comments mean three dry runs.
          setPosted(prev => new Set(prev).add(only[0]));
          if (Array.isArray(d.errors) && d.errors.length > 0) setError(d.errors[0]);
        } else {
          const why = (Array.isArray(d.errors) && d.errors[0])
            || 'GitHub accepted the request but recorded no inline comment. Nothing was posted.';
          setFailed(prev => ({ ...prev, [fp]: why }));
          setError(why);
        }
      } else {
        setEdits({});
        setExcluded(new Set());
        setPosted(new Set());
        setDone(d.message ?? 'Done.');
        if (Array.isArray(d.errors) && d.errors.length > 0) setError(d.errors[0]);
        onDone(mode);

        if (mode === 'comment') {
          // Refresh the plan in place so the ON THIS PR list reflects what just
          // happened. Re-running the ANALYSIS would be wrong twice over: the
          // code has not changed, and it blanks the workspace on the way.
          setPreview(null);
          void call('comment', false);
        } else {
          setPreview(null);
        }
      }
    } catch (e: any) {
      const data = e.response?.data;
      const msg = [data?.error ?? e.message ?? 'Request failed', data?.detail]
        .filter(Boolean).join(' — ');
      setError(msg);
      if (only) setFailed(prev => ({ ...prev, [only[0]]: msg }));
    } finally {
      setBusy(null);
    }
  };

  /**
   * Resolve one conversation by hand.
   *
   * Distinct from the analyzer-driven path: that one resolves what the code
   * proves is gone, this records a human judgement — "fixed differently", or
   * "not a problem here". Both end at GitHub's own Resolve conversation.
   */
  const resolveOne = async (fp: string) => {
    if (!prUrl) return;
    setBusy(`resolve:${fp}`);
    setError(null);
    try {
      await axios.post(`${API}/comment`, {
        url: prUrl, token, confirm: true, resolveOnly: [fp],
      });
      // Resolving one by hand has to leave the PLAN as well as the row.
      // `resolutions` is a snapshot taken by the dry run, so without this the
      // confirm button kept offering "mark 4 resolved" after one of the four
      // had already been resolved.
      setPreview(prev => {
        if (!prev) return prev;
        const done = prev.resolutions.find(r => r.fingerprint === fp);
        return {
          ...prev,
          onPR: prev.onPR.map(e => (
            e.fingerprint === fp ? { ...e, status: 'resolved' as const, canResolve: false } : e
          )),
          resolutions: prev.resolutions.filter(r => r.fingerprint !== fp),
          // Moved rather than dropped, so it stays visible as done instead of
          // vanishing from the panel entirely.
          alreadyResolved: done && !prev.alreadyResolved.some(r => r.fingerprint === fp)
            ? [...prev.alreadyResolved, done]
            : prev.alreadyResolved,
        };
      });
    } catch (e: any) {
      const data = e.response?.data;
      setError([data?.error ?? e.message, data?.detail].filter(Boolean).join(' — '));
    } finally {
      setBusy(null);
    }
  };

  const closePreview = () => {
    // Nothing to re-analyze: posting comments does not change the code. The
    // panel simply closes.
    setPreview(null);
    setPosted(new Set());
  };

  if (!prUrl) return null;

  /**
   * The dry-run preview. Extracted from the JSX so it can render inside
   * the Post tab for a comment plan, and on its own for a commit plan —
   * committing is a different action and does not belong under a tab
   * about comments.
   *
   * `framed` is false inside the tab: the tab already supplies the card,
   * and nesting a second bordered box inside it just looks like a bug.
   */
  const renderPreview = (framed: boolean) => {
    if (!preview) return null;
      const remaining = preview.comments.filter(c => !posted.has(c.fingerprint));
      const selectedCount = preview.mode === 'comment'
        ? remaining.filter(c => !excluded.has(c.fingerprint)).length
        : preview.detail.length;

      // Marking a fixed finding's comment as resolved IS a write, even with
      // nothing to post. Counting only postable comments disabled the button
      // whenever every current finding was already commented on — which is
      // precisely the state a PR reaches once the fixes land, so the whole
      // resolve-in-place path was unreachable.
      const resolveCount = preview.mode === 'comment' ? preview.resolutions.length : 0;
      // Restoring a deleted summary is a write with nothing to select and
      // nothing to resolve. Leaving it out of this count disabled the confirm
      // button while the server was perfectly willing to do it.
      const summaryOnly = preview.mode === 'comment'
        && selectedCount === 0 && resolveCount === 0 && preview.willPostSummary;
      const nothingToWrite = selectedCount === 0 && resolveCount === 0 && !summaryOnly;

      const confirmLabel = preview.mode !== 'comment'
        ? 'Confirm & commit'
        : summaryOnly
        ? 'Restore the summary'
        : [
            selectedCount > 0 ? `Post ${selectedCount}` : null,
            resolveCount > 0 ? `mark ${resolveCount} resolved` : null,
          ].filter(Boolean).join(' · ') || 'Nothing to write';

      return (
        <div style={{
          textAlign: 'left', padding: 12,
          display: 'flex', flexDirection: 'column', gap: 8,
          ...(framed ? {
            background: 'var(--card)', border: '1px solid var(--bd2)',
            borderRadius: 8, boxShadow: 'var(--shadow-lg)',
            maxHeight: 'min(46vh, 460px)', overflowY: 'auto' as const,
          } : {}),
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em', color: 'var(--t6)' }}>
              DRY RUN — nothing has been written yet
            </span>
            <div style={{ flex: 1 }} />
            {posted.size > 0 && (
              <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ok)' }}>
                {posted.size} posted
              </span>
            )}
          </div>

          <div style={{ fontSize: 12, color: 'var(--t1)', lineHeight: 1.5 }}>{preview.message}</div>

          {preview.mode === 'comment' && preview.comments.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => setExcluded(new Set())} disabled={excluded.size === 0}
                style={{ ...btn('ghost'), fontSize: 9, padding: '2px 6px' }}>
                select all
              </button>
              <button onClick={() => setExcluded(new Set(preview.comments.map(c => c.fingerprint)))}
                disabled={excluded.size === preview.comments.length}
                style={{ ...btn('ghost'), fontSize: 9, padding: '2px 6px' }}>
                select none
              </button>
              <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--t7)' }}>
                Post individually, or tick several and post them together as one review.
              </span>
            </div>
          )}

          {preview.mode === 'comment' && preview.comments.length > 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 8,
              maxHeight: 320, overflowY: 'auto',
            }}>
              {preview.comments.map(c => {
                const isPosted = posted.has(c.fingerprint);
                const on = !excluded.has(c.fingerprint) && !isPosted;
                const value = edits[c.fingerprint] ?? c.defaultDetail ?? '';
                const changed = value.trim() !== (c.defaultDetail ?? '').trim();
                const posting = busy === `one:${c.fingerprint}`;
                const rowFailed = failed[c.fingerprint];

                return (
                  <div key={c.fingerprint} style={{
                    display: 'flex', flexDirection: 'column', gap: 5,
                    background: 'var(--code)',
                    border: `1px solid ${
                      rowFailed ? 'var(--sev1)'
                      : isPosted ? 'var(--ok)'
                      : on ? 'var(--bd4)' : 'var(--bd2)'
                    }`,
                    borderRadius: 6, padding: '8px 9px',
                    opacity: isPosted ? 0.75 : on ? 1 : 0.55,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: isPosted ? 'default' : 'pointer', userSelect: 'none' }}>
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={isPosted}
                          onChange={() => setExcluded(prev => {
                            const next = new Set(prev);
                            if (next.has(c.fingerprint)) next.delete(c.fingerprint);
                            else next.add(c.fingerprint);
                            return next;
                          })}
                          style={{ accentColor: 'var(--accent)', cursor: isPosted ? 'default' : 'pointer' }}
                        />
                        <span style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--t6)' }}>
                          {c.path}:{c.line ?? '?'}
                        </span>
                      </label>
                      <div style={{ flex: 1 }} />
                      {changed && !isPosted && (
                        <button
                          onClick={() => setEdits(p => {
                            const next = { ...p };
                            delete next[c.fingerprint];
                            return next;
                          })}
                          style={{ ...btn('ghost'), fontSize: 9, padding: '2px 6px' }}
                        >
                          reset
                        </button>
                      )}
                      {/* Its own Post button, per your ask. Posts THIS comment
                          and nothing else, and leaves the panel open so the
                          rest can be handled one at a time. */}
                      {isPosted ? (
                        <span style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--ok)' }}>posted ✓</span>
                      ) : (
                        <button
                          onClick={() => call('comment', true, [c.fingerprint])}
                          disabled={busy !== null || needsToken}
                          title={needsToken
                            ? 'Needs a GitHub token — a comment must have an author'
                            : rowFailed
                              ? 'Try posting this comment again'
                              : 'Post just this comment'}
                          style={{
                            ...btn(rowFailed ? 'ghost' : 'danger'),
                            fontSize: 9.5, padding: '3px 8px',
                            ...(rowFailed ? { color: 'var(--sev1)', borderColor: 'var(--sev1)' } : {}),
                          }}
                        >
                          {posting ? 'posting…' : rowFailed ? '↻ Retry' : 'Post'}
                        </button>
                      )}
                    </div>

                    <div style={{ fontSize: 11.5, color: 'var(--t1)', lineHeight: 1.4 }}>{c.title}</div>

                    {/* The reason lives on the row that failed, not only in
                        the panel-wide error, so it is obvious WHICH comment
                        did not land when several were posted in a row. */}
                    {rowFailed && (
                      <div style={{
                        fontFamily: MONO, fontSize: 9.5, color: 'var(--sev1)',
                        lineHeight: 1.5, wordBreak: 'break-word',
                      }}>
                        not posted — {rowFailed}
                      </div>
                    )}

                    <textarea
                      value={value}
                      disabled={!on}
                      onChange={e => setEdits(p => ({ ...p, [c.fingerprint]: e.target.value }))}
                      rows={3}
                      maxLength={1000}
                      spellCheck
                      style={{
                        width: '100%', resize: 'vertical',
                        background: 'var(--input)', color: 'var(--t2)',
                        border: `1px solid ${changed ? 'var(--info-bd)' : 'var(--bd2)'}`,
                        borderRadius: 5, padding: '6px 7px',
                        fontFamily: 'var(--font-sans)', fontSize: 11.5,
                        lineHeight: 1.5, outline: 0,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* The standing record. This is the answer to "what did I flag on
              this PR?", which is a question asked days later, long after the
              dry run that produced them. Each row can be resolved by hand —
              a reviewer may have fixed it differently, or decided it does
              not apply here, and neither is something the analyzer can
              conclude on its own. */}
          {preview.mode === 'comment' && preview.onPR.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{
                display: 'flex', alignItems: 'baseline', gap: 8,
                fontFamily: MONO, fontSize: 10, color: 'var(--t6)',
              }}>
                <span>ON THIS PR ({preview.onPR.length})</span>
                <span style={{ color: 'var(--t7)' }}>
                  {preview.onPR.filter(e => e.status === 'resolved').length} resolved ·{' '}
                  {preview.onPR.filter(e => e.status === 'commented').length} open
                </span>
              </div>

              <div style={{
                display: 'flex', flexDirection: 'column',
                maxHeight: 240, overflowY: 'auto',
                background: 'var(--code)', border: '1px solid var(--bd4)',
                borderRadius: 6,
              }}>
                {preview.onPR.map(e => {
                  const isResolved = e.status === 'resolved';
                  const working = busy === `resolve:${e.fingerprint}`;
                  return (
                    <div key={e.fingerprint} style={{
                      display: 'flex', alignItems: 'center', gap: 9,
                      padding: '6px 9px', borderBottom: '1px solid var(--line)',
                      opacity: isResolved ? 0.6 : 1,
                    }}>
                      <span style={{
                        fontFamily: MONO, fontSize: 9,
                        color: isResolved ? 'var(--ok)' : 'var(--sev2)',
                        border: `1px solid ${isResolved ? 'var(--ok)' : 'var(--sev2)'}`,
                        borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap',
                      }}>
                        {isResolved ? 'resolved' : 'open'}
                      </span>

                      <span style={{
                        fontSize: 11.5, color: 'var(--t2)', lineHeight: 1.45,
                        flex: 1, minWidth: 0,
                        textDecoration: isResolved ? 'line-through' : 'none',
                      }}>
                        {e.title}
                      </span>

                      {/* Say where each row stands, because "open" alone
                          does not distinguish a real outstanding problem from
                          one that is fixed but never closed off. */}
                      {!isResolved && !e.stillFound && (
                        <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--ok)' }}>
                          fixed — not closed yet
                        </span>
                      )}
                      {!isResolved && e.stillFound && (
                        <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--sev2)' }}>
                          still in the code
                        </span>
                      )}
                      {/* Closed on GitHub while the problem is still in
                          the code. Says so rather than letting a resolved
                          thread read as a fixed finding — the thread is
                          GitHub's business, the code is ours. */}
                      {isResolved && e.stillFound && (
                        <span
                          title="This conversation is resolved on GitHub, but the analyzer still finds the problem in the code."
                          style={{ fontFamily: MONO, fontSize: 9, color: 'var(--sev2)' }}
                        >
                          closed, but still in the code
                        </span>
                      )}
                      {e.legacyResolvedNote && (
                        <span
                          title="An older version edited this comment to say Resolved without resolving the thread. GitHub still shows it open."
                          style={{ fontFamily: MONO, fontSize: 9, color: 'var(--t6)' }}
                        >
                          thread still open
                        </span>
                      )}

                      <span style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--t6)', whiteSpace: 'nowrap' }}>
                        {e.path}{e.line ? `:${e.line}` : ''}
                      </span>

                      {e.url && (
                        <a href={e.url} target="_blank" rel="noreferrer"
                          style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--info-fg)' }}>
                          view
                        </a>
                      )}

                      {/* Offered ONLY when the analyzer can no longer find
                          the problem. Closing a thread on something still
                          broken would record it as handled, which is a claim
                          about the code rather than about the thread. */}
                      {!isResolved && e.canResolve && (
                        <button
                          onClick={() => resolveOne(e.fingerprint)}
                          disabled={busy !== null || needsToken}
                          title="Resolve this conversation on GitHub — the analyzer no longer finds this problem"
                          style={{ ...btn('ghost'), fontSize: 9, padding: '2px 7px' }}
                        >
                          {working ? 'resolving…' : 'Mark resolved'}
                        </button>
                      )}
                      {!isResolved && !e.canResolve && e.stillFound && (
                        <span
                          title="Fix it first. If you disagree with the finding, resolve the thread on GitHub."
                          style={{ fontFamily: MONO, fontSize: 9, color: 'var(--t7)', padding: '2px 7px' }}
                        >
                          not fixed
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Already done on an earlier run. Listed with links because an
              edited inline comment lives on the Files-changed tab and is
              genuinely hard to find among a long diff — "3 already marked
              resolved" was a claim with nowhere to go. */}
          {preview.mode === 'comment' && preview.alreadyResolved.length > 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 5,
              background: 'var(--code)', border: '1px solid var(--bd4)',
              borderRadius: 6, padding: '9px 10px',
            }}>
              <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--t6)' }}>
                ALREADY MARKED RESOLVED ON THIS PR ({preview.alreadyResolved.length})
              </div>
              {preview.alreadyResolved.map(r => (
                <div key={r.fingerprint} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                  <span style={{ color: 'var(--ok)', fontSize: 11 }}>✓</span>
                  <span style={{
                    fontSize: 11.5, color: 'var(--t4)', lineHeight: 1.5,
                    flex: 1, minWidth: 0, textDecoration: 'line-through',
                  }}>
                    {r.title || r.fingerprint}
                  </span>
                  {r.url
                    ? <a href={r.url} target="_blank" rel="noreferrer"
                        style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--info-fg)' }}>
                        view on GitHub →
                      </a>
                    : r.path && <span style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--t6)' }}>{r.path}</span>}
                </div>
              ))}
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--t7)', lineHeight: 1.5 }}>
                These are inline review comments, so they appear on the PR's Files changed tab.
              </div>
            </div>
          )}

          {/* What will be EDITED on the PR, not posted. A reviewer is about
              to authorise changes to comments already published under their
              name, so the panel names them rather than saying "3". */}
          {preview.mode === 'comment' && preview.resolutions.length > 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 5,
              background: 'var(--code)', border: '1px solid var(--ok)',
              borderRadius: 6, padding: '9px 10px',
            }}>
              <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ok)' }}>
                FIXED SINCE THE LAST REVIEW — {preview.resolutions.length} conversation
                {preview.resolutions.length === 1 ? '' : 's'} will be resolved on GitHub
              </div>
              {preview.resolutions.map(r => (
                <div key={r.fingerprint} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                  <span style={{ color: 'var(--ok)', fontSize: 11 }}>✓</span>
                  <span style={{ fontSize: 11.5, color: 'var(--t2)', lineHeight: 1.5, flex: 1, minWidth: 0 }}>
                    {r.title || r.fingerprint}
                  </span>
                  {r.url
                    ? <a href={r.url} target="_blank" rel="noreferrer"
                        style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--info-fg)' }}>
                        view on GitHub →
                      </a>
                    : r.path && <span style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--t6)' }}>{r.path}</span>}
                </div>
              ))}
              {/* Describes what actually happens now. This used to promise the
                  body would be rewritten and the original tucked into a
                  <details>, which is what the tool did BEFORE it used GitHub's
                  own resolve — copy left behind by the implementation change. */}
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--t7)', lineHeight: 1.5 }}>
                The comments are left exactly as they are; their threads are marked
                resolved and collapse on the PR.
              </div>
            </div>
          )}

          {preview.detail.length > 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 3,
              maxHeight: 200, overflowY: 'auto',
              background: 'var(--code)', border: '1px solid var(--bd4)',
              borderRadius: 6, padding: '8px 9px',
            }}>
              {preview.detail.map((d, i) => (
                <div key={i} style={{ fontFamily: MONO, fontSize: 10, color: 'var(--t3)', lineHeight: 1.6 }}>{d}</div>
              ))}
            </div>
          )}

          {preview.rejected.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--t6)' }}>
                COULD NOT PATCH ({preview.rejected.length})
              </div>
              {preview.rejected.map((r, i) => (
                <div key={i} style={{ fontSize: 10.5, color: 'var(--t5)', lineHeight: 1.5 }}>{r.reason}</div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
            <button onClick={closePreview} style={btn('ghost')}>
              {posted.size > 0 ? 'Close' : 'Cancel'}
            </button>
            {/* The bulk path is still here: several comments in ONE review
                means the PR author gets one notification, not one per
                finding. Posting individually is a deliberate choice, not the
                only option. */}
            <button
              onClick={() => call(preview.mode, true)}
              disabled={busy !== null || nothingToWrite}
              style={{ ...btn('danger'), opacity: nothingToWrite ? 0.5 : 1 }}
            >
              {busy === preview.mode ? 'writing…' : confirmLabel}
            </button>
          </div>
        </div>
      );
  };

  const actionCtx: PRActionCtx = {
    aiReviewRan, inDepthRunning, reanalyzing,
    runInDepth: onRunInDepth,
    reanalyze: onReanalyze,
  };

  const viewCtx: PRViewCtx = {
    prUrl, token, risks, anchored, needsToken, busy,
    tab: activeTab,
    setTab: tab => setPanelTab(tab as typeof panelTab),
    dryRun: mode => call(mode, false),
    requestToken: () => onNeedToken?.(),
    slots: {
      history: () => <ReviewHistory prUrl={prUrl} refreshKey={dataVersion} />,
      commentPlan: () => (
        needsToken ? (
          <div style={{ padding: 14, fontSize: 12, color: 'var(--t4)', lineHeight: 1.6 }}>
            A GitHub token is required to post — GitHub has no anonymous commenting,
            so a comment needs an author. `public_repo` scope is enough for a public repo.
          </div>
        ) : preview?.mode === 'comment' ? renderPreview(false) : (
          <div style={{ padding: 14, fontFamily: MONO, fontSize: 11, color: 'var(--t5)' }}>
            {busy === 'comment' ? 'Checking what is on the PR…' : 'Nothing loaded — reopen to refresh.'}
          </div>
        )
      ),
      fixes: () => (
        preview?.mode === 'commit' ? renderPreview(false) : (
          <div style={{ padding: 14, fontFamily: MONO, fontSize: 11, color: 'var(--t5)' }}>
            {busy === 'commit' ? 'Generating patches…'
              : needsToken ? 'A token with Contents: write is required to commit a fix.'
              : 'No patches loaded — reopen to generate them.'}
          </div>
        )
      ),
    },
  };

  /** Open a view, or close it if it is already the open one. */
  const openViewTab = (id: string, tab?: string) => {
    const def = PR_VIEWS.find(v => v.id === id);
    if (!def) return;
    if (!tab && openView?.id === id) { setPanelTab(null); return; }
    const next = tab ?? def.tabs?.[0].key ?? def.id;
    setPanelTab(next as typeof panelTab);
    def.onOpen?.({ ...viewCtx, tab: next }, next);
  };

  return (
    <div
      data-tour={dataTour}
      style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      padding: '10px 16px 0',
      // Grows to fill the column when a view is open; otherwise it is just the
      // row of buttons and stays out of the canvas's way.
      flex: panelTab ? '1 1 auto' : '0 0 auto',
      minHeight: 0,
      paddingBottom: panelTab ? 16 : 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>

        {/* Rendered from PR_BAR in prViews.tsx, in the order declared there.
            Nothing here knows what any particular button does — adding one is
            an entry in that file, not an edit to this row. */}
        {PR_BAR.map(entry => {
          if (entry.kind === 'action') {
            const disabled = entry.isDisabled?.(actionCtx) ?? false;
            return (
              <button
                key={entry.id}
                onClick={() => entry.run(actionCtx)}
                disabled={disabled}
                title={typeof entry.title === 'function' ? entry.title(actionCtx) : entry.title}
                style={{
                  ...btn(entry.isActive?.(actionCtx) ? 'on' : 'ghost'),
                  cursor: disabled ? 'default' : 'pointer',
                }}
              >
                <span>{typeof entry.icon === 'function' ? entry.icon(actionCtx) : entry.icon}</span>
                {entry.label(actionCtx)}
              </button>
            );
          }

          const isOpen = openView?.id === entry.id;
          const unusable = entry.isDisabled?.(viewCtx) ?? false;
          return (
            <button
              key={entry.id}
              onClick={() => openViewTab(entry.id)}
              disabled={unusable || busy !== null}
              title={typeof entry.title === 'function' ? entry.title(viewCtx) : entry.title}
              style={{ ...btn(isOpen ? 'on' : 'ghost'), opacity: unusable ? 0.5 : 1 }}
            >
              <span>{entry.icon}</span>
              {entry.label(viewCtx)}
              {(entry.hasBadge?.(viewCtx) || (entry.id === 'comments' && changeNotice)) && (
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: 'var(--info-fg)', flex: '0 0 6px',
                }} />
              )}
            </button>
          );
        })}

        <div style={{ flex: 1 }} />

        {/* The automation, stated rather than hidden. B2 ruled out a background
            refresh precisely because silent automation is hard to trust; this
            keeps the rule's intent by showing the interval next to the switch
            that turns it off. Every check is read-only. */}
        {onAutoMinutesChange && (
          <div
            title="Re-checks this PR for new commits while the tab is open. Read-only, and never runs the in-depth review."
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: MONO, fontSize: 10, color: 'var(--t6)',
            }}
          >
            <span>auto-check</span>
            {[0, 5, 15, 30].map(m => (
              <button
                key={m}
                onClick={() => onAutoMinutesChange(m)}
                style={{
                  fontFamily: MONO, fontSize: 10, cursor: 'pointer',
                  padding: '3px 7px', borderRadius: 5,
                  background: autoMinutes === m ? 'var(--sel-bg)' : 'transparent',
                  border: `1px solid ${autoMinutes === m ? 'var(--sel-bd)' : 'var(--bd2)'}`,
                  color: autoMinutes === m ? 'var(--t1)' : 'var(--t6)',
                }}
              >
                {m === 0 ? 'off' : `${m}m`}
              </button>
            ))}
          </div>
        )}

        {done && <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ok)' }}>{done}</span>}
      </div>

      {/* Something changed while you were elsewhere. Deliberately a strip and
          not a toast: a toast that disappears is exactly the wrong shape for
          news you might step away from. */}
      {changeNotice && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '8px 11px', borderRadius: 7,
          background: 'var(--info-bg)', border: '1px solid var(--info-bd)',
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--info-fg)', flex: '0 0 7px',
            animation: 'pulseNode 2s ease-in-out 3',
          }} />
          <span style={{ fontSize: 12, color: 'var(--t1)' }}>
            New commit <code style={{ fontFamily: MONO }}>{changeNotice.sha.slice(0, 7)}</code> — {changeNotice.summary}
          </span>
          <button
            onClick={() => setPanelTab('history')}
            style={{ ...btn('ghost'), fontSize: 9.5, padding: '3px 8px' }}
          >
            See what changed
          </button>
          <div style={{ flex: 1 }} />
          <button
            onClick={onDismissNotice}
            style={{ ...btn('ghost'), fontSize: 9.5, padding: '3px 8px' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* One panel, two tabs. Both answer questions about the same review
          record, so they share a frame instead of being two things to find. */}
      {/* Panel body comes from the open view's own render(). Nothing here
          branches on which view it is — that is the point of the registry. */}
      {openView && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--bd2)',
          borderRadius: 8, boxShadow: 'var(--shadow-lg)',
          display: 'flex', flexDirection: 'column',
          // Takes the column instead of being capped. Sixteen comments with
          // editable bodies were unreadable through a 460px slot.
          flex: 1, minHeight: 0, overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '6px 8px', borderBottom: '1px solid var(--line)',
            flex: '0 0 auto',
          }}>
            {openView.tabs
              ? openView.tabs.map(t => (
                  <button
                    key={t.key}
                    onClick={() => openViewTab(openView.id, t.key)}
                    style={{
                      fontFamily: MONO, fontSize: 10.5, cursor: 'pointer',
                      padding: '5px 10px', borderRadius: 5, border: 0,
                      background: activeTab === t.key ? 'var(--sel-bg)' : 'transparent',
                      color: activeTab === t.key ? 'var(--t1)' : 'var(--t6)',
                    }}
                  >
                    {t.label}
                  </button>
                ))
              : (
                <span style={{
                  fontFamily: MONO, fontSize: 10.5, color: 'var(--t2)', padding: '5px 10px',
                }}>
                  {openView.label(viewCtx)}
                </span>
              )}

            <div style={{ flex: 1 }} />
            <button
              onClick={() => { setPanelTab(null); setPreview(null); setPosted(new Set()); }}
              title="Back to the graph"
              style={{ ...btn('ghost'), fontSize: 9.5, padding: '3px 8px' }}
            >
              ← Back to graph
            </button>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {openView.render(viewCtx)}
          </div>
        </div>
      )}
      {error && (
        <div style={{
          fontFamily: MONO, fontSize: 10, color: 'var(--sev1)', lineHeight: 1.5,
        }}>
          {error}
        </div>
      )}


    </div>
  );
}
