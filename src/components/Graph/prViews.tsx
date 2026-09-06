// src/components/Graph/prViews.tsx
//
// The PR action bar, declared as data.
//
// ── Adding a button ──────────────────────────────────────────────────────
//
// One entry in PR_BAR, in the position you want it on screen. `kind: 'action'`
// does something and opens nothing; `kind: 'view'` takes over the column until
// closed. Nothing in PRActionBar.tsx needs editing for either — it maps over
// this list and knows nothing about what any particular button does.
//
//   {
//     kind: 'view',
//     id: 'coverage',
//     icon: '▦',
//     label: () => 'Coverage',
//     title: 'Which changed lines are covered by tests',
//     render: ctx => <CoverageView risks={ctx.risks} prUrl={ctx.prUrl} />,
//   })
//
// Everything a button can need is on the context: the PR, the findings, the
// token situation, what is in flight, and the request helpers. If a new view
// needs something the context does not carry, add it to PRViewCtx once and
// every view can use it.
//
// ── A note on the two original views ─────────────────────────────────────
//
// `comments` and `fixes` render through ctx.slots rather than inline JSX. That
// is history, not a pattern: their bodies were written before this registry
// existed and are several hundred lines of editable comment rows. A NEW view
// should return its own JSX from `render` directly. The slots exist so those
// two did not have to be rewritten to introduce the registry — moving working,
// live-tested code for tidiness is a bad trade.

import type { ReactNode } from 'react';
import type { Finding } from '../../types/risk';

export type PRViewId = 'comments' | 'fixes' | (string & {});

/** A tab inside a view's panel. Omit `tabs` for a single-pane view. */
export interface PRViewTab {
  key: string;
  label: string;
}

export interface PRViewCtx {
  prUrl?: string;
  token: string;
  risks: Finding[];
  /** Findings with a verified diff position — the only ones that can be
   *  commented inline or patched. */
  anchored: Finding[];
  /** True when an action would need a token the user has not supplied. */
  needsToken: boolean;
  /** Identifier of the request in flight, or null. */
  busy: string | null;
  /** Which tab of the open view is selected. */
  tab: string | null;
  setTab: (tab: string) => void;
  /** Ask the server what a write WOULD do. Never writes. */
  dryRun: (mode: 'comment' | 'commit') => Promise<void>;
  /** Prompt for a token, focusing the field. */
  requestToken: () => void;
  /** Rendered bodies belonging to views that predate this registry. */
  slots: Record<string, () => ReactNode>;
}

export interface PRViewDef {
  kind: 'view';
  id: PRViewId;
  icon: string;
  /** A function so a label can reflect state ("Checking…"). */
  label: (ctx: PRViewCtx) => string;
  title: string | ((ctx: PRViewCtx) => string);
  tabs?: PRViewTab[];
  /** Runs when the view is opened, or when a tab is selected. */
  onOpen?: (ctx: PRViewCtx, tab: string | null) => void;
  render: (ctx: PRViewCtx) => ReactNode;
  /** Greyed out and unclickable when true. */
  isDisabled?: (ctx: PRViewCtx) => boolean;
  /** Shows an attention dot. */
  hasBadge?: (ctx: PRViewCtx) => boolean;
}

export interface PRActionDef {
  kind: 'action';
  id: string;
  icon: string | ((ctx: PRActionCtx) => string);
  label: (ctx: PRActionCtx) => string;
  title: string | ((ctx: PRActionCtx) => string);
  run: (ctx: PRActionCtx) => void;
  isDisabled?: (ctx: PRActionCtx) => boolean;
  /** Renders in the "on" tone — the action has already been taken. */
  isActive?: (ctx: PRActionCtx) => boolean;
}

export interface PRActionCtx {
  aiReviewRan?: boolean;
  inDepthRunning?: boolean;
  reanalyzing?: boolean;
  runInDepth: () => void;
  reanalyze: () => void;
}

/**
 * The bar, in the order it renders.
 *
 * ONE list, deliberately. Splitting actions and views into two arrays made
 * position depend on which array an entry happened to be in, so moving a
 * button meant moving it between files' worth of context. Here the order on
 * screen is the order written down.
 */
export type PRBarEntry = PRActionDef | PRViewDef;

export const PR_BAR: PRBarEntry[] = [
  {
    kind: 'action',
    id: 'in-depth',
    icon: ctx => (ctx.aiReviewRan ? '✓' : '⌕'),
    label: ctx => (
      ctx.inDepthRunning ? 'Reviewing…'
        : ctx.aiReviewRan ? 'In-depth review done'
        : 'In-depth review'
    ),
    title: ctx => (ctx.aiReviewRan
      ? 'The in-depth review has already run for this analysis.'
      : 'Reads the diff for bugs the static rules cannot see — a missing await, a null '
        + 'dereference, a hardcoded secret, a route with no auth check. One extra model call.'),
    run: ctx => ctx.runInDepth(),
    isDisabled: ctx => !!ctx.aiReviewRan || !!ctx.inDepthRunning,
    isActive: ctx => !!ctx.aiReviewRan,
  },
  {
    kind: 'view',
    id: 'comments',
    icon: '❝',
    label: ctx => (ctx.busy === 'comment' ? 'Checking…' : 'Review comments & history'),
    title: 'Comments on this PR: what is already there, what would be posted, '
      + 'and what each revision changed',
    tabs: [
      { key: 'post', label: 'Post comments' },
      { key: 'history', label: 'Review history' },
    ],
    // Only the post tab needs a request; the history tab reads stored
    // snapshots and should never cost a round trip.
    onOpen: (ctx, tab) => {
      if (tab !== 'post') return;
      if (ctx.needsToken) ctx.requestToken();
      else void ctx.dryRun('comment');
    },
    render: ctx => (ctx.tab === 'history'
      ? ctx.slots.history?.()
      : ctx.slots.commentPlan?.()),
  },
  {
    kind: 'view',
    id: 'fixes',
    icon: '⚒',
    label: ctx => (ctx.busy === 'commit' ? 'Generating…' : 'Suggest fixes'),
    title: ctx => (ctx.anchored.length === 0
      ? 'No finding has a verified position to patch'
      : 'Generate real patches and preview the diffs before anything is committed'),
    onOpen: ctx => {
      if (ctx.needsToken) ctx.requestToken();
      else void ctx.dryRun('commit');
    },
    render: ctx => ctx.slots.fixes?.(),
    isDisabled: ctx => ctx.anchored.length === 0,
  },
  {
    kind: 'action',
    id: 'refresh',
    icon: '↻',
    label: ctx => (ctx.reanalyzing ? 'Refreshing…' : 'Refresh'),
    title: 'Re-analyze at the latest commit and compare against the last review — '
      + 'shows what got fixed, what is still open, and what came back',
    run: ctx => ctx.reanalyze(),
    isDisabled: ctx => !!ctx.reanalyzing,
  },
];

/** Just the views, for lookups by id. */
export const PR_VIEWS: PRViewDef[] =
  PR_BAR.filter((e): e is PRViewDef => e.kind === 'view');
