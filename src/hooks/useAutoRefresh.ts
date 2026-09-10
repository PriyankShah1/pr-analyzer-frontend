// src/hooks/useAutoRefresh.ts
//
// Periodically re-checks the open PR so a push that happens while you are
// looking elsewhere does not go unnoticed.
//
// This amends decision B2 ("no background refresh — refresh is a user-clicked
// button"). B2's concern was hidden automation, and it was written when the
// token lived only in a component's memory. The concern still stands, so the
// automation here is deliberately NOT hidden: the interval sits next to the
// control that turns it off, and every tick is the same read-only request the
// Refresh button makes. It never writes.
//
// Three things keep it cheap and quiet:
//
//   - It only runs while the tab is VISIBLE. A background tab polling GitHub
//     for a PR nobody is looking at is pure waste.
//   - It wakes on a short heartbeat and compares elapsed time, rather than
//     using one long setInterval. A laptop that sleeps for an hour and wakes
//     should check once on waking, not fire a backlog of missed intervals.
//   - It skips while a request is already in flight, so a slow analysis cannot
//     stack up behind itself.

import { useEffect, useRef, useState } from 'react';

/** How often the timer wakes to decide whether a check is due. */
const HEARTBEAT_MS = 20_000;

export interface AutoRefreshOptions {
  enabled: boolean;
  intervalMs: number;
  /** Skip this tick — a request is already running, or nothing is open. */
  paused: boolean;
  onTick: () => void | Promise<void>;
}

export function useAutoRefresh({ enabled, intervalMs, paused, onTick }: AutoRefreshOptions) {
  const lastRunAtRef = useRef<number | null>(null);
  const runningRef = useRef(false);

  // Held in refs so changing them does not restart the timer, which would
  // otherwise reset the countdown on every render.
  const tickRef = useRef(onTick);
  tickRef.current = onTick;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Drives the visible countdown only.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) {
      lastRunAtRef.current = null;
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();

    const maybeRun = async () => {
      if (cancelled) return;
      setNow(Date.now());

      if (document.visibilityState !== 'visible') return;
      if (pausedRef.current || runningRef.current) return;

      const lastRun = lastRunAtRef.current ?? startedAt;
      if (Date.now() - lastRun < intervalMs) return;

      runningRef.current = true;
      try {
        await tickRef.current();
      } finally {
        runningRef.current = false;
        if (!cancelled) {
          lastRunAtRef.current = Date.now();
          setNow(Date.now());
        }
      }
    };

    const id = setInterval(maybeRun, HEARTBEAT_MS);
    // Returning to the tab is exactly when a check is most wanted.
    document.addEventListener('visibilitychange', maybeRun);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', maybeRun);
    };
  }, [enabled, intervalMs]);

  const nextRunInMs = enabled
    ? Math.max(0, intervalMs - (now - (lastRunAtRef.current ?? now)))
    : null;

  return { lastRunAt: lastRunAtRef.current, nextRunInMs };
}
