// src/services/explanationCache.ts
//
// Explanations already fetched, kept outside React so they survive a remount.
//
// The AIExplanation component held them in its own state, which is correct
// while it is mounted and useless the moment it is not. Opening a view,
// switching to the graph and coming back re-mounted it, cleared the cache, and
// spent another model call for a translation already paid for.
//
// Keyed by the PR's head SHA rather than its URL: a new commit means a new
// diff, so the old explanation genuinely no longer describes it. Keyed by URL
// alone, a refreshed PR would keep showing the previous revision's summary.
//
// Deliberately module scope, not React state. Threading this through four
// components to reach one leaf would be more machinery than the thing it
// carries, and a memo of network results is a well understood shape. It is
// bounded so a long session cannot grow it without limit.

/** Distinct (sha, language) pairs held before the oldest is dropped. */
const MAX_ENTRIES = 60;

const cache = new Map<string, string>();

function keyFor(sha: string | null | undefined, language: string) {
  return `${sha || 'no-sha'}::${language}`;
}

export function getExplanation(sha: string | null | undefined, language: string) {
  return cache.get(keyFor(sha, language)) ?? null;
}

export function putExplanation(
  sha: string | null | undefined,
  language: string,
  text: string,
) {
  if (!text) return;
  const key = keyFor(sha, language);
  // Re-insert so recently used entries are the last to be evicted.
  cache.delete(key);
  cache.set(key, text);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Everything held for one revision, to seed a freshly mounted component. */
export function explanationsFor(sha: string | null | undefined) {
  const prefix = `${sha || 'no-sha'}::`;
  const out: Record<string, string> = {};
  for (const [key, value] of cache) {
    if (key.startsWith(prefix)) out[key.slice(prefix.length)] = value;
  }
  return out;
}
