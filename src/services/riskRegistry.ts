// src/services/riskRegistry.ts
//
// localStorage persistence for review snapshots, so a re-review can compare
// against what was found last time. All diff logic lives in riskDiff.ts —
// this file only stores and retrieves.
//
// Chosen over a database deliberately (see V6_BUILD_PLAN decision B3): zero
// infrastructure, at the cost of being per-browser. Two honest consequences
// the UI must not hide:
//   - history does not follow the user to another machine
//   - clearing site data clears the review history
//
// Every read is defensive. Stored data may come from an older build with a
// different shape, and a malformed entry must degrade to "no history" rather
// than throwing inside a render.

import type { Finding, ReviewSnapshot } from '../types/risk';
import { computeRiskDiff, carryForwardResolved } from './riskDiff';
import type { RiskDiff } from '../types/risk';
import { writeShrinking, readJSON, removeKey } from './safeStorage';

const STORAGE_KEY = 'pr-analyzer-risk-registry';

/** Revisions kept per PR. Enough to see a fix-and-regress cycle; bounded so one busy PR can't fill the quota. */
const MAX_SNAPSHOTS_PER_PR = 10;

/** Distinct PRs tracked. Oldest-reviewed PR is evicted first. */
const MAX_TRACKED_PRS = 30;

type RegistryShape = Record<string, ReviewSnapshot[]>;

export function prKey(repo: string, prNumber: number): string {
  return `${repo}#${prNumber}`;
}

function isSnapshot(value: unknown): value is ReviewSnapshot {
  if (!value || typeof value !== 'object') return false;
  const s = value as Partial<ReviewSnapshot>;
  return typeof s.sha === 'string'
    && typeof s.prNumber === 'number'
    && Array.isArray(s.findings)
    && Array.isArray(s.resolvedFingerprints);
}

function load(): RegistryShape {
  try {
    const parsed = readJSON<unknown>(STORAGE_KEY, {});
    if (!parsed || typeof parsed !== 'object') return {};

    // Drop anything that doesn't match the current shape rather than letting
    // a stale entry from an older build crash a render downstream.
    const clean: RegistryShape = {};
    for (const [key, snapshots] of Object.entries(parsed)) {
      if (!Array.isArray(snapshots)) continue;
      const valid = snapshots.filter(isSnapshot);
      if (valid.length > 0) clean[key] = valid;
    }
    return clean;
  } catch {
    return {};
  }
}

function save(registry: RegistryShape): void {
  // Shrink by dropping the least-recently-reviewed PR each time, rather than
  // halving once and then deleting the whole registry if that still does not
  // fit. Losing the oldest PR's review history costs a re-review of that PR;
  // losing the registry costs every PR's "was this fixed?" answer at once.
  writeShrinking(STORAGE_KEY, registry, current => {
    const entries = Object.entries(current)
      .sort((a, b) => lastReviewedAt(b[1]) - lastReviewedAt(a[1]));
    if (entries.length === 0) return null;
    return Object.fromEntries(entries.slice(0, entries.length - 1));
  });
}

function lastReviewedAt(snapshots: ReviewSnapshot[]): number {
  return snapshots.length === 0 ? 0 : snapshots[snapshots.length - 1].reviewedAt;
}

/** Most recent snapshot for a PR, or null if never reviewed. */
export function getLatestSnapshot(repo: string, prNumber: number): ReviewSnapshot | null {
  const snapshots = load()[prKey(repo, prNumber)];
  if (!snapshots || snapshots.length === 0) return null;
  return snapshots[snapshots.length - 1];
}

/** Full review history for a PR, oldest first. */
export function getSnapshots(repo: string, prNumber: number): ReviewSnapshot[] {
  return load()[prKey(repo, prNumber)] ?? [];
}

/** Every tracked PR, most recently reviewed first — the board's data source. */
export function getTrackedPRs(): Array<{
  key: string;
  repo: string;
  prNumber: number;
  prTitle: string;
  prState: string;
  latestSha: string;
  reviewCount: number;
  lastReviewedAt: number;
  openRisks: number;
  criticalRisks: number;
}> {
  const registry = load();

  return Object.entries(registry)
    .map(([key, snapshots]) => {
      const latest = snapshots[snapshots.length - 1];
      return {
        key,
        repo: latest.repo,
        prNumber: latest.prNumber,
        prTitle: latest.prTitle,
        prState: latest.prState,
        latestSha: latest.sha,
        reviewCount: snapshots.length,
        lastReviewedAt: latest.reviewedAt,
        openRisks: latest.findings.length,
        criticalRisks: latest.findings.filter(f => f.severity === 'critical').length,
      };
    })
    .sort((a, b) => b.lastReviewedAt - a.lastReviewedAt);
}

/**
 * Record a review and return how it compares to the previous one.
 *
 * Re-analysing the SAME sha is idempotent: the stored snapshot is replaced
 * and the comparison still runs against the revision before it. Without that,
 * clicking Refresh twice on an unchanged PR would compare a revision to
 * itself and report everything as freshly resolved.
 */
export function recordReview(params: {
  repo: string;
  prNumber: number;
  sha: string;
  prTitle: string;
  prState: string;
  findings: Finding[];
}): RiskDiff {
  const { repo, prNumber, sha, prTitle, prState, findings } = params;

  const registry = load();
  const key = prKey(repo, prNumber);
  const existing = registry[key] ?? [];

  // If this sha is already the newest stored snapshot, compare against the
  // one before it, not against itself.
  const isRerunOfLatest = existing.length > 0 && existing[existing.length - 1].sha === sha;
  const baseline = isRerunOfLatest
    ? (existing.length > 1 ? existing[existing.length - 2] : null)
    : (existing.length > 0 ? existing[existing.length - 1] : null);

  const diff = computeRiskDiff(baseline, { sha, findings });

  const snapshot: ReviewSnapshot = {
    repo,
    prNumber,
    sha,
    reviewedAt: Date.now(),
    prTitle,
    prState,
    findings,
    resolvedFingerprints: carryForwardResolved(baseline, diff),
  };

  const kept = isRerunOfLatest ? existing.slice(0, -1) : existing;
  registry[key] = [...kept, snapshot].slice(-MAX_SNAPSHOTS_PER_PR);

  // Evict least-recently-reviewed PRs once over the cap.
  const keys = Object.keys(registry);
  if (keys.length > MAX_TRACKED_PRS) {
    const ordered = keys.sort((a, b) => lastReviewedAt(registry[b]) - lastReviewedAt(registry[a]));
    for (const stale of ordered.slice(MAX_TRACKED_PRS)) delete registry[stale];
  }

  save(registry);
  return diff;
}

/**
 * What a re-review WOULD report, without recording it. Used to render the
 * comparison before the user commits to overwriting their baseline.
 */
export function previewDiff(
  repo: string,
  prNumber: number,
  sha: string,
  findings: Finding[],
): RiskDiff {
  const latest = getLatestSnapshot(repo, prNumber);
  const baseline = latest && latest.sha === sha
    ? (getSnapshots(repo, prNumber).slice(-2)[0] ?? null)
    : latest;
  return computeRiskDiff(baseline, { sha, findings });
}

export function forgetPR(repo: string, prNumber: number): void {
  const registry = load();
  delete registry[prKey(repo, prNumber)];
  save(registry);
}

export function clearRegistry(): void {
  removeKey(STORAGE_KEY);
}

/** Parse "https://github.com/owner/repo/pull/42" → { repo, prNumber }. */
export function parseRepoAndNumber(url: string): { repo: string; prNumber: number } | null {
  const m = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(url);
  if (!m) return null;
  return { repo: `${m[1]}/${m[2]}`, prNumber: parseInt(m[3], 10) };
}
