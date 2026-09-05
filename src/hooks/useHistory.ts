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

export type { PRHistoryItem } from '../types';

const STORAGE_KEY = 'pr-analyzer-history';
const MAX_HISTORY = 20;

function loadHistory(): PRHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
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
  } catch {
    return [];
  }
}

function saveHistory(items: PRHistoryItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Quota exceeded. Full analysis results are large, so halving the list is
    // the realistic recovery; if even that fails, keep the in-memory list and
    // let the next write try again rather than throwing during a render.
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(items.slice(0, Math.floor(MAX_HISTORY / 2))),
      );
    } catch { /* storage is unusable — this session stays memory-only */ }
  }
}

export function useHistory() {
  const [history, setHistory] = useState<PRHistoryItem[]>(loadHistory);

  useEffect(() => {
    saveHistory(history);
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

  return { history, addToHistory, removeFromHistory, clearHistory, maxHistory: MAX_HISTORY };
}
