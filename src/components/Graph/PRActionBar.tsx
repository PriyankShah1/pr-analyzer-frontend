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

import { useState } from 'react';
import axios from 'axios';
import type { Finding } from '../../types/risk';
import { ReviewHistory } from './ReviewHistory';

const API = import.meta.env.VITE_API_URL;
const MONO = 'var(--font-mono)';

type Mode = 'comment' | 'commit';

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
  detail: string[];
  rejected: Array<{ fingerprint: string; reason: string }>;
}

interface PRActionBarProps {
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
  /** Review history lives beside Refresh: it answers "did my last push fix
   *  anything?", which is the question Refresh provokes. */
  historyOpen?: boolean;
  onToggleHistory?: () => void;
  /** Called once something has actually been written, to refresh the view. */
  onDone: () => void;
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
  prUrl, token, risks, aiReviewRan, onRunInDepth, inDepthRunning,
  onReanalyze, reanalyzing, tokenOptional, onNeedToken, onDone,
  historyOpen, onToggleHistory,
}: PRActionBarProps) {
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
        setPreview(null);
        setEdits({});
        setExcluded(new Set());
        setPosted(new Set());
        setDone(d.message ?? 'Done.');
        if (Array.isArray(d.errors) && d.errors.length > 0) setError(d.errors[0]);
        onDone();
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
      setPreview(prev => prev && ({
        ...prev,
        onPR: prev.onPR.map(e => (
          e.fingerprint === fp ? { ...e, status: 'resolved' as const, canResolve: false } : e
        )),
      }));
    } catch (e: any) {
      const data = e.response?.data;
      setError([data?.error ?? e.message, data?.detail].filter(Boolean).join(' — '));
    } finally {
      setBusy(null);
    }
  };

  const closePreview = () => {
    // Anything posted one-by-one still needs the view refreshed on the way out.
    const wrote = posted.size > 0;
    setPreview(null);
    setPosted(new Set());
    if (wrote) onDone();
  };

  if (!prUrl) return null;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      padding: '10px 16px 0', flex: '0 0 auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>

        {/* 1 — In-depth review. An analysis option, so it reads as a toggle
            that has or has not been spent on this run. */}
        <button
          onClick={onRunInDepth}
          disabled={aiReviewRan || inDepthRunning}
          title={aiReviewRan
            ? 'The in-depth review has already run for this analysis.'
            : 'Reads the diff for bugs the static rules cannot see — a missing await, a null '
              + 'dereference, a hardcoded secret, a route with no auth check. One extra model call.'}
          style={{
            ...btn(aiReviewRan ? 'on' : 'ghost'),
            cursor: aiReviewRan || inDepthRunning ? 'default' : 'pointer',
          }}
        >
          <span>{aiReviewRan ? '✓' : '⌕'}</span>
          {inDepthRunning ? 'Reviewing…' : aiReviewRan ? 'In-depth review done' : 'In-depth review'}
        </button>

        {/* 2 — Post comments */}
        <button
          onClick={() => (needsToken ? onNeedToken?.() : call('comment', false))}
          disabled={busy !== null}
          title={needsToken
            ? 'GitHub has no anonymous commenting — a comment needs an author, so a token is required even on a public repo. Read-only scope is not enough; `public_repo` is.'
            : 'Preview the comments before anything is posted'}
          style={btn(needsToken ? 'ghost' : 'accent')}
        >
          <span>❝</span>
          {busy === 'comment' ? 'Checking…' : needsToken ? 'Post comments (add token)' : 'Post comments'}
        </button>

        {/* 3 — Suggest fixes */}
        <button
          onClick={() => (needsToken ? onNeedToken?.() : call('commit', false))}
          disabled={busy !== null || anchored.length === 0}
          title={anchored.length === 0
            ? 'No finding has a verified position to patch'
            : 'Generate real patches and preview the diffs before anything is committed'}
          style={{ ...btn('ghost'), opacity: anchored.length === 0 ? 0.5 : 1 }}
        >
          <span>⚒</span>
          {busy === 'commit' ? 'Generating…' : 'Suggest fixes'}
        </button>

        {/* 4 — Refresh */}
        <button
          onClick={onReanalyze}
          disabled={reanalyzing}
          title="Re-analyze at the latest commit and compare against the last review — shows what got fixed, what is still open, and what came back"
          style={{ ...btn('ghost'), cursor: reanalyzing ? 'default' : 'pointer' }}
        >
          <span>↻</span>
          {reanalyzing ? 'Refreshing…' : 'Refresh'}
        </button>

        {/* 5 — Review history. Next to Refresh on purpose: Refresh is what
            produces a new revision, and this is where you read what it
            changed. */}
        <button
          onClick={onToggleHistory}
          title="Revision by revision: what each push fixed, what it left open, and what came back"
          style={btn(historyOpen ? 'on' : 'ghost')}
        >
          <span>▤</span>
          Review history
        </button>

        <div style={{ flex: 1 }} />

        {done && <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ok)' }}>{done}</span>}
      </div>

      {historyOpen && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--bd2)',
          borderRadius: 8, boxShadow: 'var(--shadow-lg)',
          maxHeight: 'min(42vh, 440px)', overflowY: 'auto',
        }}>
          <ReviewHistory prUrl={prUrl} />
        </div>
      )}

      {error && (
        <div style={{
          fontFamily: MONO, fontSize: 10, color: 'var(--sev1)', lineHeight: 1.5,
        }}>
          {error}
        </div>
      )}

      {preview && (() => {
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
        const nothingToWrite = selectedCount === 0 && resolveCount === 0;

        const confirmLabel = preview.mode !== 'comment'
          ? 'Confirm & commit'
          : [
              selectedCount > 0 ? `Post ${selectedCount}` : null,
              resolveCount > 0 ? `mark ${resolveCount} resolved` : null,
            ].filter(Boolean).join(' · ') || 'Nothing to write';

        return (
          <div style={{
            textAlign: 'left', background: 'var(--card)',
            border: '1px solid var(--bd2)', borderRadius: 8, padding: 12,
            boxShadow: 'var(--shadow-lg)',
            display: 'flex', flexDirection: 'column', gap: 8,
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
                  FIXED SINCE THE LAST REVIEW — {preview.resolutions.length} comment
                  {preview.resolutions.length === 1 ? '' : 's'} will be edited to “✅ Resolved”
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
                <div style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--t7)', lineHeight: 1.5 }}>
                  The original wording is kept in a collapsed section on each comment.
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
      })()}
    </div>
  );
}
