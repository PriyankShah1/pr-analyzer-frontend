// src/hooks/useAnalyze.ts
// All API call logic — extracted from App.tsx

import { useState } from 'react';
import axios from 'axios';
import type { AnalysisResponse } from '../types';
import type { RiskDiff } from '../types/risk';
import { recordReview, parseRepoAndNumber } from '../services/riskRegistry';

const API = import.meta.env.VITE_API_URL;

export interface AnalysisRun {
  data: AnalysisResponse;
  /** How this revision compares to the previous one, or null when the PR has
   *  no head SHA to key a snapshot on. */
  diff: RiskDiff | null;
}

/**
 * Did the request fail to COMPLETE, as opposed to being answered and rejected?
 *
 * `ERR_NETWORK` alone is not enough. A timeout arrives as `ECONNABORTED`, and
 * this backend sleeps when idle — a cold start timing out is one of the most
 * likely failures in production, and it used to be reported as a healthy
 * backend plus the raw string "timeout of 30000ms exceeded". The Node-side
 * codes are here so the same helper can be tested against a real socket
 * failure rather than a hand-made stub.
 */
export function isTransportFailure(err: any): boolean {
  if (err?.response) return false;   // it answered; the status says the rest
  return err?.code === 'ERR_NETWORK'
    || err?.code === 'ECONNABORTED'  // axios timeout
    || err?.code === 'ETIMEDOUT'
    || err?.code === 'ECONNREFUSED'
    || err?.code === 'ECONNRESET'
    || err?.code === 'ENOTFOUND'
    || err?.code === 'EAI_AGAIN';
}

/** True for the subset of transport failures that are specifically a timeout. */
function isTimeout(err: any): boolean {
  return err?.code === 'ECONNABORTED' || err?.code === 'ETIMEDOUT';
}

/** Turn an axios failure into something a reviewer can act on. Exported for
 *  the backend-down test (C-vii), which drives it with a real transport error. */
export function describeError(err: any, hasToken: boolean): string {
  if (err.response?.status === 429)
    return `Too many requests. Wait ${err.response.data.retryAfter}s.`;
  if (err.response?.status === 404)
    return 'PR not found. Check the URL and verify repo access.';
  if (err.response?.status === 401)
    return hasToken
      ? 'Token rejected — may be expired or missing repo scope.'
      : 'Auth failed. This may be a private repo — add your token.';
  if (err.response?.status === 403)
    return 'Access forbidden. Check repo permissions or rate limits.';
  if (err.response?.status === 422)
    return err.response.data.error || 'PR is too large to analyze.';
  if (isTimeout(err))
    return 'The backend did not respond in time. It sleeps when idle, so the '
      + 'first request after a quiet period can time out — try again.';
  if (isTransportFailure(err))
    return 'Cannot reach the backend. Check that it is running, then try again.';
  return err.response?.data?.error || err.message || 'Failed to analyze PR';
}

export function useAnalyze() {
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result,   setResult]   = useState<AnalysisResponse | null>(null);
  // How this run compares to the last review of the same PR. Null when the
  // PR has no head SHA (cached pre-v6 result) — never fabricate a comparison.
  const [riskDiff, setRiskDiff] = useState<RiskDiff | null>(null);
  // Real backend telemetry for the header status chip. The design mocks a
  // fixed "240ms · cached"; showing a made-up number would be worse than
  // showing none, so these are measured from the actual request.
  const [health, setHealth] = useState<{
    up: boolean | null; latencyMs: number | null; cached: boolean;
  }>({ up: null, latencyMs: null, cached: false });

  /**
   * POST /analyze, measure the backend, and record the revision in the risk
   * registry. Shared by the header's Analyze and the board's Refresh, so the
   * two can never diverge on what a review means.
   *
   * Deliberately touches NO view state beyond `health` — the caller decides
   * whether this run becomes the open workspace.
   */
  const run = async (
    url: string,
    token: string | undefined,
    opts: { refresh?: boolean; aiReview?: boolean } = {},
  ): Promise<AnalysisRun> => {
    const startedAt = performance.now();

    try {
      const response = await axios.post(`${API}/analyze`, {
        url,
        token: token?.trim() || undefined,
        // Refresh asks "is this still true at the latest commit?", which a
        // cached answer cannot settle.
        refresh: opts.refresh || undefined,
        // Opt-in: the in-depth review is a second, larger model call, so a
        // plain Analyze does not spend it.
        aiReview: opts.aiReview || undefined,
      });

      setHealth({
        up: true,
        latencyMs: Math.round(performance.now() - startedAt),
        cached: Boolean(response.data?.fromCache),
      });

      const data: AnalysisResponse = response.data;

      // Record this revision and compare it to the previous one. Requires a
      // head SHA to key on: without it we cannot tell two revisions apart, so
      // we skip recording rather than storing an ambiguous snapshot.
      const ids = parseRepoAndNumber(url);
      let diff: RiskDiff | null = null;
      if (ids && data.prHeadSha) {
        try {
          diff = recordReview({
            repo:     data.prRepo || ids.repo,
            prNumber: ids.prNumber,
            sha:      data.prHeadSha,
            prTitle:  data.prTitle || `${ids.repo} #${ids.prNumber}`,
            prState:  data.prState || 'unknown',
            findings: data.risks || [],
          });
        } catch {
          // A registry failure must never break the analysis the user asked
          // for — they still get their result, just without the comparison.
          diff = null;
        }
      }

      return { data, diff };

    } catch (err: any) {
      // Only a transport failure means the backend is down. An HTTP error
      // (404, 422, rate limit) means it answered fine and rejected the input.
      setHealth({
        up: !isTransportFailure(err),
        latencyMs: Math.round(performance.now() - startedAt),
        cached: false,
      });
      throw new Error(describeError(err, !!token?.trim()));
    }
  };

  /** Analyze a PR and make it the open workspace. */
  const analyze = async (
    url: string,
    token?: string,
    opts: { aiReview?: boolean } = {},
  ): Promise<AnalysisResponse | null> => {
    setLoading(true);
    setError(null);
    setResult(null);
    setWarnings([]);
    setRiskDiff(null);

    try {
      const { data, diff } = await run(url, token, opts);
      setResult(data);
      setWarnings(data.warnings || []);
      setRiskDiff(diff);
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Re-analyze a PR from the tracking board at its latest commit.
   *
   * Unlike `analyze` this sets no view state: refreshing a tile must not blank
   * out a different PR the user has open in the workspace, and the board shows
   * per-tile progress of its own. The caller decides what to do with the
   * result — including adopting it as the workspace when it IS the open PR.
   */
  const reanalyze = (url: string, token?: string, aiReview = false): Promise<AnalysisRun> =>
    run(url, token, { refresh: true, aiReview });

  /** Adopt an already-completed run as the open workspace. */
  const adoptRun = ({ data, diff }: AnalysisRun) => {
    setResult(data);
    setWarnings(data.warnings || []);
    setRiskDiff(diff);
    setError(null);
  };

  const reset = () => {
    setError(null);
    setResult(null);
    setWarnings([]);
    setRiskDiff(null);
  };

  return {
    loading, error, warnings, result, riskDiff, health,
    analyze, reanalyze, adoptRun, reset,
    setResult, setError, setWarnings,
  };
}
