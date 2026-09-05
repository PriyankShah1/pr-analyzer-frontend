// src/utils/runSummary.ts
// Shared derivation of a stored run's headline facts.
//
// The History board's tiles and its rollup need the same answers ("how many
// issues?", "was this even in scope?"), and they must never disagree — a PR
// reading "clean" in one place and "3 issues" in the other destroys trust in
// both. So the logic lives here once.

import type { AnalysisResponse, PRHistoryItem, PRIdentity, SeverityCounts } from '../types';
import type { Finding } from '../types/risk';

export type Verdict = 'issues' | 'clean' | 'scope';

export function splitUrl(url: string): { repo: string; num: string } {
  const m = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(url);
  if (!m) return { repo: url, num: '' };
  return { repo: `${m[1]}/${m[2]}`, num: `#${m[3]}` };
}

export function relativeTime(ts: number): string {
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

/**
 * Total problems in a run.
 *
 * Prefers v6's `totalRisks` (SQL + AI + static, already merged server-side).
 * Falls back to summing the individual v5 counters so entries stored before
 * v6 existed still report something truthful rather than zero.
 */
export function issueCount(item: PRHistoryItem): number {
  const stats = (item.result?.visualization?.stats ?? {}) as Record<string, number | undefined>;
  if (typeof stats.totalRisks === 'number') return stats.totalRisks;
  return (stats.mismatches ?? 0)
    + (stats.brokenDependencies ?? 0)
    + (stats.brokenProps ?? 0)
    + (stats.missingDeps ?? 0);
}

/**
 * Zero nodes means the analyzer found no application code — a framework repo
 * or an unsupported stack. That is a deliberate non-result, NOT a clean bill
 * of health, so it gets its own verdict. Collapsing the two would quietly
 * report an unanalyzable PR as passing.
 */
export function verdictOf(item: PRHistoryItem): Verdict {
  const nodes = item.result?.visualization?.stats?.totalNodes ?? 0;
  if (nodes === 0) return 'scope';
  return issueCount(item) > 0 ? 'issues' : 'clean';
}

export const VERDICT_COLOR: Record<Verdict, { dot: string; fg: string }> = {
  issues: { dot: 'var(--sev2)', fg: 'var(--sev2)' },
  clean:  { dot: 'var(--ok)',   fg: 'var(--ok)' },
  scope:  { dot: 'var(--t7)',   fg: 'var(--t5)' },
};

/** "https://github.com/owner/repo/pull/42" -> "owner/repo #42". */
export function labelFromUrl(url: string): string {
  try {
    // https://github.com/owner/repo/pull/42 → owner/repo #42
    const parts = url.split('/');
    return `${parts[3]}/${parts[4]} #${parts[6]}`;
  } catch {
    return url;
  }
}

/** Count findings by severity. Exported so legacy entries can be back-filled. */
export function countBySeverity(findings: Finding[] | undefined): SeverityCounts {
  const counts: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
  for (const f of findings ?? []) {
    if (f && (f.severity === 'critical' || f.severity === 'high'
           || f.severity === 'medium'   || f.severity === 'low')) {
      counts[f.severity] += 1;
      counts.total += 1;
    }
  }
  return counts;
}

/** Pull the PR's identity out of a response, falling back to the URL. */
export function identify(url: string, result: AnalysisResponse | null): PRIdentity {
  const m = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(url);
  return {
    repo:    result?.prRepo || (m ? `${m[1]}/${m[2]}` : url),
    number:  result?.prNumber ?? (m ? parseInt(m[3], 10) : null),
    title:   result?.prTitle || labelFromUrl(url),
    author:  result?.prAuthor || '',
    // 'unknown' rather than assuming 'open' — a board that reports a merged PR
    // as open is worse than one that admits it does not know.
    state:   result?.prState || 'unknown',
    headSha: result?.prHeadSha ?? null,
  };
}
