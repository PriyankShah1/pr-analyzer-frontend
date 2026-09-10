// src/hooks/useHistory.ts
// localStorage persistence for analyzed PRs — the PR tracking board's store.
//
// One entry per PR URL: re-analyzing a PR replaces its entry rather than
// appending, so the board shows PRs, not a run log. The per-revision history
// (what changed between two commits) is the risk registry's job — this file
// holds the latest full analysis so a click-through can render a PR without
// going back to the network.

import { useState, useEffect } from 'react';
import type { AnalysisResponse, PRHistoryItem } from '../types';
// countBySeverity/identify live in utils/runSummary because they are pure
// derivations the board needs without ever mounting a hook.
import { countBySeverity, identify, labelFromUrl } from '../utils/runSummary';
import { writeShrinking, halveFromEnd, readJSON } from '../services/safeStorage';

export type { PRHistoryItem } from '../types';

const STORAGE_KEY = 'pr-analyzer-history';
const MAX_HISTORY = 20;

function loadHistory(): PRHistoryItem[] {
  const parsed = readJSON<unknown>(STORAGE_KEY, []);
  // A stale or hand-edited entry must degrade to "not stored" rather than
  // crash a render. Only the fields every reader dereferences are required;
  // `pr` and `severity` are optional by design and derived when absent.
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (h: unknown): h is PRHistoryItem =>
      !!h && typeof h === 'object'
      && typeof (h as PRHistoryItem).id === 'string'
      && typeof (h as PRHistoryItem).url === 'string'
      && !!(h as PRHistoryItem).result,
  );
}

export function useHistory() {
  const [history, setHistory] = useState<PRHistoryItem[]>(loadHistory);

  /**
   * Set when storage could not hold everything, so the board can SAY so.
   *
   * Silent eviction was the old behaviour: the list on screen kept all 20
   * entries while storage held 10, and the missing half only appeared (as an
   * absence) after a reload.
   */
  const [storageNotice, setStorageNotice] = useState<string | null>(null);

  useEffect(() => {
    const outcome = writeShrinking(STORAGE_KEY, history, halveFromEnd);

    if (outcome.unavailable) {
      setStorageNotice(
        'This browser is not allowing local storage, so analyses will be kept '
        + 'only until you close the tab.',
      );
      return;
    }

    const kept = outcome.stored?.length ?? 0;
    if (kept >= history.length) return;

    const dropped = history.length - kept;

    // Nothing fit at all. Keep the list in memory rather than wiping it —
    // discarding it would throw away the analysis that had just completed,
    // which is the one the user is looking at.
    if (kept === 0) {
      setStorageNotice(
        'Local storage is full, so analyses cannot be saved. They are kept for '
        + 'this tab and will be gone after a reload — clear some site data to '
        + 'save them again.',
      );
      return;
    }

    // Otherwise match state to what was actually written: the effect re-runs
    // once on the shorter list, finds it fits, and settles.
    setStorageNotice(
      `Local storage is full, so ${dropped} older ${dropped === 1 ? 'analysis was' : 'analyses were'} `
      + 'dropped. The PRs themselves are unaffected — re-analyze to bring one back.',
    );
    setHistory(outcome.stored ?? []);
  }, [history]);

  const addToHistory = (url: string, result: AnalysisResponse) => {
    const pr = identify(url, result);
    const item: PRHistoryItem = {
      // The URL IS the identity — there is exactly one entry per PR. A random
      // id would change on every re-analysis, so the board's active tile and
      // any in-flight refresh state would be orphaned the moment a refresh
      // landed. Legacy entries keep their random id until next analyzed.
      id: url,
      url,
      label: pr.title,
      analyzedAt: Date.now(),
      stats: result.visualization?.stats ?? { totalNodes: 0, totalEdges: 0, mismatches: 0 },
      pr,
      severity: countBySeverity(result.risks),
      result,
    };

    setHistory(prev => {
      // Replace if same URL exists, otherwise prepend
      const filtered = prev.filter(h => h.url !== url);
      return [item, ...filtered].slice(0, MAX_HISTORY);
    });
    return item;
  };

  const removeFromHistory = (id: string) => {
    setHistory(prev => prev.filter(h => h.id !== id));
  };

  const clearHistory = () => {
    setHistory([]);
  };

  return {
    history,
    addToHistory,
    removeFromHistory,
    clearHistory,
    maxHistory: MAX_HISTORY,
    storageNotice,
    dismissStorageNotice: () => setStorageNotice(null),
  };
}
