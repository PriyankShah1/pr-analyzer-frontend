// src/services/safeStorage.ts
//
// Writing to localStorage without losing data silently.
//
// Two call sites (the history board and the risk registry) each had their own
// quota handling, and both had the same two defects:
//
//   1. On a quota error they wrote a SMALLER value to storage but told the
//      caller nothing. React state kept the full list, so what the user saw
//      and what was actually stored diverged — and on the next reload, half
//      their history vanished with no explanation. The write has to report
//      what it actually stored so the caller can agree with it.
//   2. A single fixed retry ("write half"). If half still does not fit, the
//      write is abandoned, or the whole key is deleted. Shrinking until it
//      fits keeps as much as possible instead of falling off a cliff.
//
// This module is deliberately free of React and of any particular value shape,
// so it can be tested against a stubbed storage with a real quota.

/** Storage that fits in the browser's Storage interface, narrowed to what we use. */
interface Storageish {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function storage(): Storageish | null {
  try {
    // Access itself throws in some privacy modes, so this is inside the try.
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Is this the browser saying "full", as opposed to "storage is off"?
 *
 * The name and code differ per engine, and a blocked-storage SecurityError is
 * NOT a quota error — shrinking would loop pointlessly against it.
 */
function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number };
  return e.name === 'QuotaExceededError'
    || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'   // Firefox
    || e.code === 22                              // most engines
    || e.code === 1014;                           // Firefox
}

export interface WriteOutcome<T> {
  /** Something was written. False means storage is unusable this session. */
  ok: boolean;
  /** What is ACTUALLY in storage now — the caller should match its state to this. */
  stored: T | null;
  /** How many times the value had to be shrunk before it fit. 0 is the happy path. */
  shrinks: number;
  /** Storage cannot be written at all (private window, blocked site data). */
  unavailable: boolean;
}

/**
 * Write `value`, shrinking it until it fits.
 *
 * `shrink` returns a smaller value, or null when it cannot shrink further.
 * The returned `stored` is what actually landed, so a caller holding React
 * state can bring itself into line rather than drifting.
 */
export function writeShrinking<T>(
  key: string,
  value: T,
  shrink: (current: T) => T | null,
): WriteOutcome<T> {
  const ls = storage();
  if (!ls) return { ok: false, stored: null, shrinks: 0, unavailable: true };

  let candidate: T | null = value;
  let shrinks = 0;

  while (candidate !== null) {
    try {
      ls.setItem(key, JSON.stringify(candidate));
      return { ok: true, stored: candidate, shrinks, unavailable: false };
    } catch (err) {
      if (!isQuotaError(err)) {
        // Not a size problem — shrinking will never help.
        return { ok: false, stored: null, shrinks, unavailable: true };
      }
      candidate = shrink(candidate);
      shrinks += 1;
    }
  }

  // Nothing fits, not even the smallest form. Remove the key rather than
  // leaving whatever stale value was there before, which would be read back
  // later as if it were current.
  try { ls.removeItem(key); } catch { /* nothing left to try */ }
  return { ok: false, stored: null, shrinks, unavailable: false };
}

/** Shrink an array by dropping its tail — for lists held newest-first. */
export function halveFromEnd<T>(items: T[]): T[] | null {
  if (items.length === 0) return null;
  return items.slice(0, Math.floor(items.length / 2));
}

/** Read and JSON-parse a key. Returns `fallback` for missing/corrupt values. */
export function readJSON<T>(key: string, fallback: T): T {
  const ls = storage();
  if (!ls) return fallback;
  try {
    const raw = ls.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function removeKey(key: string): void {
  const ls = storage();
  if (!ls) return;
  try { ls.removeItem(key); } catch { /* already gone */ }
}
