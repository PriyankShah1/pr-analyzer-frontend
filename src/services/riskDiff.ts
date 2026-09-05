// src/services/riskDiff.ts
//
// The recursive-review engine. Pure functions only — no localStorage, no
// React, no network — so the logic that decides "was this risk fixed?" can be
// tested in isolation and the storage layer can change without touching it.
//
// The whole thing rests on one property: a finding's fingerprint is derived
// from normalized code, never from its line number. Push a commit that moves
// a bad query 300 lines down and the fingerprint is identical; fix the query
// and it disappears. That is what makes resolution detectable at all.

import type {
  Finding,
  ReviewSnapshot,
  RiskDiff,
  MitigationItem,
  RiskStatus,
} from '../types/risk';

function byFingerprint(findings: Finding[]): Map<string, Finding> {
  const map = new Map<string, Finding>();
  for (const f of findings) map.set(f.fingerprint, f);
  return map;
}

function severityThenConfidence(a: Finding, b: Finding): number {
  return a.severityRank - b.severityRank
    || b.confidence - a.confidence
    || a.file.localeCompare(b.file)
    || (a.line ?? 0) - (b.line ?? 0);
}

/**
 * Correlate a newly introduced finding with a risk resolved in the same push.
 *
 * Deliberately weak: it only claims "same file, same push". Proving that one
 * change caused another would need the actual edit that fixed it, which we do
 * not have. Reporting a weak signal honestly is fine; dressing it up as
 * causation is not — so the field is named `possiblyCausedBy` and the UI must
 * word it that way.
 */
function findPossibleCause(
  introduced: Finding,
  resolved: Finding[],
): MitigationItem['possiblyCausedBy'] {
  const sameFile = resolved.find(r => r.file === introduced.file);
  if (!sameFile) return undefined;
  return { fingerprint: sameFile.fingerprint, title: sameFile.title };
}

/**
 * Compare the current review against the previous one.
 *
 * `previous` is null on the very first review of a PR, in which case nothing
 * is "introduced" — there is no baseline, so every finding is simply current.
 * Calling them all new would tell a reviewer their first analysis had just
 * regressed the codebase, which is nonsense.
 */
export function computeRiskDiff(
  previous: ReviewSnapshot | null,
  current: { sha: string; findings: Finding[] },
): RiskDiff {
  const currentMap = byFingerprint(current.findings);
  const isFirstReview = previous === null;

  if (isFirstReview) {
    const currentItems: MitigationItem[] = current.findings
      .slice()
      .sort(severityThenConfidence)
      .map(finding => ({ finding, status: 'persisting' as RiskStatus }));

    return {
      isFirstReview: true,
      previousSha: null,
      currentSha: current.sha,
      resolved: [],
      persisting: current.findings.slice().sort(severityThenConfidence),
      introduced: [],
      regressed: [],
      checklist: [],
      current: currentItems,
      counts: {
        resolved: 0,
        persisting: current.findings.length,
        introduced: 0,
        regressed: 0,
        mitigationRate: 0,
      },
    };
  }

  const previousMap = byFingerprint(previous.findings);
  const previouslyResolved = new Set(previous.resolvedFingerprints);

  const resolved: Finding[] = [];
  const persisting: Finding[] = [];
  const introduced: Finding[] = [];
  const regressed: Finding[] = [];

  // Walk the PREVIOUS findings to decide what got fixed.
  for (const prev of previous.findings) {
    if (currentMap.has(prev.fingerprint)) {
      // Keep the CURRENT copy — the code may have moved, so its line number
      // and diff position are the ones that are still valid.
      persisting.push(currentMap.get(prev.fingerprint)!);
    } else {
      resolved.push(prev);
    }
  }

  // Walk the CURRENT findings to decide what is new, separating a genuine
  // first appearance from a risk we had previously seen fixed.
  for (const cur of current.findings) {
    if (previousMap.has(cur.fingerprint)) continue;   // already counted
    if (previouslyResolved.has(cur.fingerprint)) regressed.push(cur);
    else introduced.push(cur);
  }

  resolved.sort(severityThenConfidence);
  persisting.sort(severityThenConfidence);
  introduced.sort(severityThenConfidence);
  regressed.sort(severityThenConfidence);

  // The literal checkbox list: everything flagged last time, ticked or not.
  const checklist: MitigationItem[] = [
    ...resolved.map(finding => ({ finding, status: 'resolved' as RiskStatus })),
    ...persisting.map(finding => ({ finding, status: 'persisting' as RiskStatus })),
  ];

  const current_: MitigationItem[] = [
    ...regressed.map(finding => ({
      finding,
      status: 'regressed' as RiskStatus,
    })),
    ...introduced.map(finding => ({
      finding,
      status: 'introduced' as RiskStatus,
      possiblyCausedBy: findPossibleCause(finding, resolved),
    })),
    ...persisting.map(finding => ({ finding, status: 'persisting' as RiskStatus })),
  ];

  const reviewedLastTime = resolved.length + persisting.length;

  return {
    isFirstReview: false,
    previousSha: previous.sha,
    currentSha: current.sha,
    resolved,
    persisting,
    introduced,
    regressed,
    checklist,
    current: current_,
    counts: {
      resolved: resolved.length,
      persisting: persisting.length,
      introduced: introduced.length,
      regressed: regressed.length,
      mitigationRate: reviewedLastTime === 0 ? 0 : resolved.length / reviewedLastTime,
    },
  };
}

/**
 * Roll the resolved-fingerprint set forward so regressions stay detectable
 * across any number of revisions, not just the immediately previous one.
 *
 * A fingerprint that has come back is removed from the set: it is currently
 * open, so if it is fixed again the next push should read as a fresh
 * resolution rather than as a second regression of the same thing.
 */
export function carryForwardResolved(
  previous: ReviewSnapshot | null,
  diff: RiskDiff,
): string[] {
  const carried = new Set(previous?.resolvedFingerprints ?? []);
  for (const f of diff.resolved) carried.add(f.fingerprint);
  for (const f of diff.regressed) carried.delete(f.fingerprint);
  return [...carried];
}

/**
 * Headline for the re-review banner. Ordered by what a reviewer most needs to
 * know first: regressions, then new risks, then progress.
 */
export function summarizeDiff(diff: RiskDiff): string {
  if (diff.isFirstReview) {
    const n = diff.counts.persisting;
    return n === 0 ? 'No risks found' : `${n} risk${n === 1 ? '' : 's'} found`;
  }

  const parts: string[] = [];
  if (diff.counts.regressed > 0)  parts.push(`${diff.counts.regressed} regressed`);
  if (diff.counts.introduced > 0) parts.push(`${diff.counts.introduced} new`);
  if (diff.counts.resolved > 0)   parts.push(`${diff.counts.resolved} fixed`);
  if (diff.counts.persisting > 0) parts.push(`${diff.counts.persisting} still open`);

  return parts.length === 0 ? 'No change since last review' : parts.join(' · ');
}
