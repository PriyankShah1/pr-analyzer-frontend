// src/services/prBoard.ts
//
// The PR tracking board's data source (§5). Pure: it takes stored runs and
// reads the risk registry, and returns rows. No React, no network — so the
// rollup arithmetic is testable in plain node.
//
// Two stores are joined here, and they answer different questions:
//
//   useHistory     — the LATEST full analysis of each PR. Enough to re-open a
//                    PR's graph and panels without going back to the network.
//   riskRegistry   — up to 10 REVISIONS of each PR's findings. This is what
//                    knows a risk was fixed three commits ago and stayed fixed.
//
// "Open critical / high" therefore comes from the run, while "resolved" can
// only come from the registry: a resolved risk is by definition absent from
// the current findings, so no single run can count it.
//
// A run whose PR was never registered (no head SHA, or a URL that did not
// parse) still gets a row — it just reports `tracked: false` and no resolved
// count, rather than a fabricated zero.

import type { PRHistoryItem, SeverityCounts } from '../types';
import type { Finding } from '../types/risk';
import { countBySeverity, identify } from '../utils/runSummary';
import { getSnapshots } from './riskRegistry';

export interface PRHealth {
  /** Findings open at the most recent analysis of this PR. */
  openCritical: number;
  openHigh: number;
  openTotal: number;
  /**
   * Risks seen in an earlier revision that are gone at the latest one and
   * have not come back. Null when the PR is untracked — "we cannot tell" and
   * "nothing has been fixed" are different answers and must not look alike.
   */
  resolved: number | null;
  /** Revisions of this PR the registry holds. 0 when untracked. */
  reviewCount: number;
  /** SHA of the revision the registry last recorded, if any. */
  latestReviewedSha: string | null;
  /** False when this PR has no registry entry, so no history is comparable. */
  tracked: boolean;
}

export interface PRBoardRow {
  /** The stored run, for click-through. */
  item: PRHistoryItem;
  id: string;
  url: string;
  repo: string;
  prNumber: number | null;
  title: string;
  author: string;
  state: string;
  headSha: string | null;
  analyzedAt: number;
  severity: SeverityCounts;
  health: PRHealth;
}

/**
 * Severity counts for a run.
 *
 * Prefers the counts written at analysis time; falls back to recounting the
 * stored findings so entries written before §5 added the field still report
 * truthfully. A run with no `risks` at all (a pre-v6 result) legitimately
 * counts zero — v6 findings did not exist when it was stored.
 */
export function severityOf(item: PRHistoryItem): SeverityCounts {
  return item.severity ?? countBySeverity(item.result?.risks as Finding[] | undefined);
}

/** Identity for a run, from the stored block or re-derived for legacy entries. */
export function identityOf(item: PRHistoryItem) {
  return item.pr ?? identify(item.url, item.result ?? null);
}

function healthFor(
  repo: string,
  prNumber: number | null,
  severity: SeverityCounts,
): PRHealth {
  const base = {
    openCritical: severity.critical,
    openHigh: severity.high,
    openTotal: severity.total,
  };

  if (prNumber === null) {
    return { ...base, resolved: null, reviewCount: 0, latestReviewedSha: null, tracked: false };
  }

  const snapshots = getSnapshots(repo, prNumber);
  if (snapshots.length === 0) {
    return { ...base, resolved: null, reviewCount: 0, latestReviewedSha: null, tracked: false };
  }

  const latest = snapshots[snapshots.length - 1];
  return {
    ...base,
    // The registry carries this set forward across every revision and drops a
    // fingerprint that regresses, so its size is exactly "fixed and still
    // fixed" — not "fixed at some point", which would keep counting a risk
    // that has since come back.
    resolved: latest.resolvedFingerprints.length,
    reviewCount: snapshots.length,
    latestReviewedSha: latest.sha,
    tracked: true,
  };
}

/** One row per stored PR, newest analysis first. */
export function buildBoard(history: PRHistoryItem[]): PRBoardRow[] {
  return history
    .map(item => {
      const id = identityOf(item);
      const severity = severityOf(item);
      return {
        item,
        id: item.id,
        url: item.url,
        repo: id.repo,
        prNumber: id.number,
        title: id.title,
        author: id.author,
        state: id.state,
        headSha: id.headSha,
        analyzedAt: item.analyzedAt,
        severity,
        health: healthFor(id.repo, id.number, severity),
      };
    })
    .sort((a, b) => b.analyzedAt - a.analyzedAt);
}

/** Board-wide totals for the header stat cards. */
export function rollup(rows: PRBoardRow[]) {
  return rows.reduce(
    (acc, r) => ({
      prs: acc.prs + 1,
      openCritical: acc.openCritical + r.health.openCritical,
      openHigh: acc.openHigh + r.health.openHigh,
      // Untracked PRs contribute nothing rather than a zero, so the total is
      // "resolved across the PRs we can actually track".
      resolved: acc.resolved + (r.health.resolved ?? 0),
      tracked: acc.tracked + (r.health.tracked ? 1 : 0),
    }),
    { prs: 0, openCritical: 0, openHigh: 0, resolved: 0, tracked: 0 },
  );
}
