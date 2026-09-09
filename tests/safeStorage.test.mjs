// C-iii: the localStorage quota path, actually executed.
//
// This code had never run. Both call sites had a quota handler written from
// reasoning alone, and both were wrong in the same way — they wrote a smaller
// value than the caller believed was stored.
//
// localStorage is stubbed with a REAL byte budget that throws a genuine
// QuotaExceededError, so the shrink loop is exercised rather than described.
//
// Run: npm run test

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const ts = require_('typescript');
const HERE = dirname(fileURLToPath(import.meta.url));

/** Transpile a project .ts file and load it as CommonJS. */
function loadTS(relPath) {
  const src = readFileSync(join(HERE, '..', relPath), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const out = join(HERE, '.build');
  mkdirSync(out, { recursive: true });
  const file = join(out, relPath.replace(/[\\/]/g, '_').replace(/\.ts$/, '.cjs'));
  writeFileSync(file, js);
  return require_(file);
}

/** localStorage with a byte budget, throwing what browsers actually throw. */
function makeStorage(budgetBytes) {
  const map = new Map();
  const size = () => [...map.entries()].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    removeItem: k => { map.delete(k); },
    setItem: (k, v) => {
      const without = [...map.entries()]
        .filter(([key]) => key !== k)
        .reduce((n, [key, val]) => n + key.length + val.length, 0);
      if (without + k.length + v.length > budgetBytes) {
        const err = new Error('quota');
        err.name = 'QuotaExceededError';
        err.code = 22;
        throw err;
      }
      map.set(k, v);
    },
    _size: size,
    _map: map,
  };
}

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  → ' + extra : '')); }
};

const { writeShrinking, halveFromEnd, readJSON, removeKey } = loadTS('src/services/safeStorage.ts');

// An entry roughly the size of a real stored analysis.
const entry = i => ({ id: 'pr-' + i, url: 'https://github.com/o/r/pull/' + i, blob: 'x'.repeat(400) });
const list = n => Array.from({ length: n }, (_, i) => entry(i));

console.log('\n1. It fits — nothing is touched');
globalThis.localStorage = makeStorage(1_000_000);
let out = writeShrinking('k', list(20), halveFromEnd);
check('ok', out.ok === true);
check('nothing shrunk', out.shrinks === 0, out.shrinks);
check('all 20 stored', out.stored.length === 20, out.stored.length);

console.log('\n2. Over quota — it shrinks until it fits, and SAYS what it kept');
globalThis.localStorage = makeStorage(3_000);   // ~7 entries' worth
out = writeShrinking('k', list(20), halveFromEnd);
check('still wrote something', out.ok === true);
check('had to shrink', out.shrinks > 0, out.shrinks);
check('kept fewer than asked', out.stored.length < 20, out.stored.length);
check('kept more than nothing', out.stored.length > 0, out.stored.length);
check('what it reports IS what is stored',
  JSON.parse(globalThis.localStorage.getItem('k')).length === out.stored.length);
check('kept the NEWEST entries (list is newest-first)',
  out.stored[0].id === 'pr-0', out.stored[0]?.id);

console.log('\n3. Nothing fits at all — the key is removed, not left stale');
globalThis.localStorage = makeStorage(1_000_000);
globalThis.localStorage.setItem('k', JSON.stringify(list(3)));   // a stale value
globalThis.localStorage = (() => {
  const s = makeStorage(5);                                       // 5 bytes: nothing fits
  s.setItem = () => { const e = new Error('q'); e.name = 'QuotaExceededError'; e.code = 22; throw e; };
  return s;
})();
out = writeShrinking('k', list(20), halveFromEnd);
check('reports failure', out.ok === false);
check('reports nothing stored', out.stored === null, JSON.stringify(out.stored));
check('not misreported as unavailable', out.unavailable === false);

console.log('\n4. Storage blocked (private window) — not mistaken for "full"');
globalThis.localStorage = {
  getItem: () => null,
  removeItem: () => {},
  setItem: () => { const e = new Error('denied'); e.name = 'SecurityError'; throw e; },
};
out = writeShrinking('k', list(20), halveFromEnd);
check('flagged unavailable', out.unavailable === true);
check('did NOT loop shrinking against it', out.shrinks === 0, out.shrinks);

console.log('\n5. Reads never throw');
globalThis.localStorage = makeStorage(1_000_000);
globalThis.localStorage.setItem('bad', '{not json');
check('corrupt JSON falls back', readJSON('bad', 'fallback') === 'fallback');
check('missing key falls back', readJSON('absent', 42) === 42);
globalThis.localStorage = undefined;
check('no storage at all falls back', readJSON('k', 'safe') === 'safe');
check('removeKey does not throw without storage',
  (() => { try { removeKey('k'); return true; } catch { return false; } })());

console.log('\n6. halveFromEnd terminates');
check('20 → 10', halveFromEnd(list(20)).length === 10);
check('1 → 0', halveFromEnd(list(1)).length === 0);
check('0 → null (cannot shrink further)', halveFromEnd([]) === null);

console.log('\n7. Registry-style shrink drops one PR at a time');
globalThis.localStorage = makeStorage(2_000);
const registry = Object.fromEntries(list(12).map((e, i) => [`repo#${i}`, [{ ...e, reviewedAt: i }]]));
out = writeShrinking('reg', registry, current => {
  const entries = Object.entries(current);
  return entries.length === 0 ? null : Object.fromEntries(entries.slice(0, entries.length - 1));
});
check('wrote a reduced registry', out.ok === true);
check('kept at least one PR', Object.keys(out.stored).length > 0, Object.keys(out.stored).length);
check('dropped one at a time, not half',
  out.shrinks === 12 - Object.keys(out.stored).length,
  `${out.shrinks} shrinks for ${12 - Object.keys(out.stored).length} dropped`);

console.log('\n' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail === 0 ? 0 : 1);
