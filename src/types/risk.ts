// src/types/risk.ts
// The canonical risk shape, shared by every finding source.
//
// The backend emits SQL findings (parsers/sqlAnalyzer.js) and AI review
// findings (services/reviewService.js) in exactly this shape, so nothing
// downstream — triage list, registry, PR commenter — ever branches on where
// a finding came from.

export type RiskSeverity = 'critical' | 'high' | 'medium' | 'low';

/** Where a finding came from. Static rules are certain; AI findings carry a confidence. */
export type RiskSource = 'sql' | 'ai' | 'static';

export interface Finding {
  kind: string;
  severity: RiskSeverity;
  /** 1 = critical … 4 = low. Precomputed so sorting never needs a lookup table. */
  severityRank: number;
  title: string;
  detail: string;
  suggestion: string;
  file: string;
  line: number | null;
  /**
   * Position within the unified diff, as GitHub's inline-comment API counts
   * it. `null` means the finding could not be anchored to a real added line
   * and therefore must NOT be posted as an inline comment — it belongs in
   * the summary instead.
   */
  diffPosition: number | null;
  snippet: string;
  /**
   * Stable identity derived from normalized code, never from line numbers.
   * This is what makes "was this risk fixed?" answerable across commits —
   * lines shift on every push, normalized code does not.
   */
  fingerprint: string;
  source: RiskSource;
  /** 1 for static rules (matched or didn't); 0.7–1.0 for AI findings. */
  confidence: number;
  /** False when the position could not be verified against the real diff. */
  anchored: boolean;
  /** True when the model cited a wrong line and we moved it to the right one. */
  reanchored?: boolean;
}

/** One review of one PR revision. Keyed by (repo, prNumber, sha). */
export interface ReviewSnapshot {
  repo: string;          // "owner/repo"
  prNumber: number;
  sha: string;           // head SHA at review time
  reviewedAt: number;    // epoch ms
  prTitle: string;
  prState: string;
  findings: Finding[];
  /**
   * Every fingerprint known to have been resolved at or before this
   * snapshot. Carried forward so a risk that comes back three revisions
   * later is still recognised as a regression, not as a brand-new finding.
   */
  resolvedFingerprints: string[];
}

/** Status of a single risk when comparing one revision against the previous. */
export type RiskStatus =
  | 'resolved'    // was present, now gone
  | 'persisting'  // present in both revisions
  | 'introduced'  // new in this revision
  | 'regressed';  // was resolved earlier, has come back

export interface MitigationItem {
  finding: Finding;
  status: RiskStatus;
  /**
   * Set on an `introduced` finding that landed in a file where a risk was
   * resolved in the same push — i.e. the fix plausibly caused it.
   *
   * This is CORRELATION, not proof: same file, same push. The UI must word
   * it as "possibly introduced by", never as a definite causal claim.
   */
  possiblyCausedBy?: {
    fingerprint: string;
    title: string;
  };
}

export interface RiskDiff {
  /** True when there is no previous snapshot — nothing to compare against. */
  isFirstReview: boolean;
  previousSha: string | null;
  currentSha: string;

  resolved: Finding[];
  persisting: Finding[];
  introduced: Finding[];
  regressed: Finding[];

  /**
   * Every risk from the previous review, each marked resolved or persisting —
   * this is the literal checkbox list: "did the new code fix what we flagged?"
   */
  checklist: MitigationItem[];

  /** All current risks with their status, for the main risk panel. */
  current: MitigationItem[];

  counts: {
    resolved: number;
    persisting: number;
    introduced: number;
    regressed: number;
    /** Resolved ÷ (resolved + persisting) from the previous review, 0–1. */
    mitigationRate: number;
  };
}
