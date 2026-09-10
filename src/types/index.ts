// src/types/index.ts
// All shared TypeScript interfaces and types

import type { Finding } from './risk';

export type { Finding } from './risk';

export interface AnalysisStats {
  totalNodes: number;
  totalEdges: number;
  mismatches: number;
  brokenDependencies?: number;
  deletedClasses?: number;
  staticCalls?: number;
  ormCalls?: number;
  brokenProps?: number;        // umbrella count: unaccepted prop names + wrong literal types
  propTypeMismatches?: number; // subset of brokenProps that are type, not name, errors
  missingDeps?: number;
  sqlFindings?: number;
  sqlCritical?: number;
  sqlHigh?: number;
  aiFindings?: number;
  totalRisks?: number;
}

export interface AnalysisVisualization {
  nodes: any[];
  edges: any[];
  stats: AnalysisStats;
}

export interface AnalysisFlow {
  from: string;
  to: string;
  type?: string;
  returnType?: string;
  mismatch?: boolean;
  brokenDependency?: boolean;
  deletedSource?: boolean;
  message?: string;
  file?: string;
}

export interface AnalysisResponse {
  prTitle?:    string;
  prNumber?:   number;
  prAuthor?:   string;
  prState?:    string;
  prMerged?:   boolean;
  language?:   string; // code language: 'php' | 'javascript' | 'none'
  visualization?: AnalysisVisualization;
  flows?:         AnalysisFlow[];
  files?:         { filename: string; truncated: boolean }[];
  warnings?:      string[];
  message?:       string;
  fromCache?:     boolean;
  deletedClasses?: string[];
  codeContext?:    string;                  // real code snippets used for AI explanation
  aiExplanations?: Record<string, string>;  // langCode -> explanation text

  // ── v6 ──────────────────────────────────────────────────────────────────
  // Identifies WHICH revision was analyzed. The risk registry keys on
  // prHeadSha; without it two reviews of the same PR are indistinguishable.
  prHeadSha?: string | null;
  prBaseSha?: string | null;
  prRepo?:    string | null;   // "owner/repo"
  prCommits?: number | null;
  prUrl?:     string;

  /**
   * False when the in-depth review was not requested for this run — the UI
   * must distinguish "found nothing" from "never ran", or a reviewer reads an
   * unrun review as a clean bill of health.
   *
   * NAMING: the UI calls this the "in-depth review"; the wire field stays
   * `aiReview`/`aiReviewRan`. The label describes what it does for a reviewer,
   * the field describes how it is implemented, and renaming the wire format
   * would break any client already sending it for no user-visible gain.
   */
  aiReviewRan?: boolean;

  sqlFindings?: Finding[];  // static SQL rules
  aiFindings?:  Finding[];  // AI logic review
  risks?:       Finding[];  // both, merged and ranked — prefer this over the two above
}

/** Findings bucketed by severity. Stored flat so a board tile never has to
 *  walk the full result to render a health chip. */
export interface SeverityCounts {
  critical: number;
  high:     number;
  medium:   number;
  low:      number;
  total:    number;
}

/**
 * Identity of the pull request a run analyzed.
 *
 * Denormalised out of `result` on purpose (§5): the board renders one tile
 * per PR and needs repo/number/author/state/SHA for every tile at once.
 * Reaching into the nested result for each of those on every render — and
 * re-parsing the URL to get repo and number — is work the write path can
 * do once.
 */
export interface PRIdentity {
  repo:    string;          // "owner/repo"
  number:  number | null;   // null when the URL did not parse
  title:   string;
  author:  string;          // '' when GitHub did not report one
  state:   string;          // 'open' | 'closed' | 'unknown'
  headSha: string | null;   // null on a pre-v6 cached result
}

export interface PRHistoryItem {
  id:          string;
  url:         string;
  label:       string;
  analyzedAt:  number;
  stats: {
    totalNodes: number;
    totalEdges: number;
    mismatches: number;
  };
  /** §5 additions. Optional: entries stored by an earlier build have neither,
   *  and both are re-derivable from `result`, so readers fall back instead of
   *  discarding a run that is otherwise perfectly good. */
  pr?:       PRIdentity;
  severity?: SeverityCounts;
  result: AnalysisResponse;
}

export type Theme = 'light' | 'dark';

// AI explanation language — fetched dynamically from GET /explain/languages,
// this type is intentionally loose (string) since the backend config is the
// single source of truth and can grow without frontend type changes.
export interface ExplanationLanguage {
  code: string;
  label: string;
  nativeLabel: string;
  isDefault: boolean;
}