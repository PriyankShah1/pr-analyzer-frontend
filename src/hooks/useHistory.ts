import { useState, useEffect } from 'react';

export interface PRHistoryItem {
  id: string;
  url: string;
  label: string;        // e.g. "owner/repo #42"
  analyzedAt: number;   // timestamp
  stats: {
    totalNodes: number;
    totalEdges: number;
    mismatches: number;
  };
  result: any;          // full analysis result
}

const STORAGE_KEY = 'pr-analyzer-history';
const MAX_HISTORY = 20;

function loadHistory(): PRHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(items: PRHistoryItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // localStorage full — remove oldest and retry
    const trimmed = items.slice(0, Math.floor(MAX_HISTORY / 2));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  }
}

function labelFromUrl(url: string): string {
  try {
    // https://github.com/owner/repo/pull/42 → owner/repo #42
    const parts = url.split('/');
    return `${parts[3]}/${parts[4]} #${parts[6]}`;
  } catch {
    return url;
  }
}

export function useHistory() {
  const [history, setHistory] = useState<PRHistoryItem[]>(loadHistory);

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  const addToHistory = (url: string, result: any) => {
    const item: PRHistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      url,
      label: result.prTitle || labelFromUrl(url),
      analyzedAt: Date.now(),
      stats: result.visualization?.stats ?? { totalNodes: 0, totalEdges: 0, mismatches: 0 },
      result,
    };

    setHistory(prev => {
      // Replace if same URL exists, otherwise prepend
      const filtered = prev.filter(h => h.url !== url);
      return [item, ...filtered].slice(0, MAX_HISTORY);
    });
  };

  const removeFromHistory = (id: string) => {
    setHistory(prev => prev.filter(h => h.id !== id));
  };

  const clearHistory = () => {
    setHistory([]);
  };

  return { history, addToHistory, removeFromHistory, clearHistory };
}