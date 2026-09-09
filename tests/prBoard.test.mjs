// C-iv: a full board. Only 2-3 PRs had ever been on it.
//
// The board is the app's front page once someone has used it for a week, and
// nothing had ever driven it past a handful of rows: not the cap, not the
// rollup arithmetic, not a malformed entry sitting between good ones.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const ts = require_('typescript');
const HERE = dirname(fileURLToPath(import.meta.url));

function loadTS(relPath, stubs = {}) {
  const src = readFileSync(join(HERE, '..', relPath), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const out = join(HERE, '.build');
  mkdirSync(out, { recursive: true });
  const file = join(out, relPath.replace(/[\\/]/g, '_').replace(/\.ts$/, '.cjs'));
  // Redirect the module's own imports to stubs where asked.
  let patched = js;
  for (const [spec, target] of Object.entries(stubs)) {
    patched = patched.split(`require("${spec}")`).join(`require(${JSON.stringify(target)})`);
  }
  writeFileSync(file, patched);
  return require_(file);
}

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  → ' + extra : '')); }
};

// The board reads the risk registry for "tracked / resolved". Stub it so this
// test is about the board, not about localStorage.
const registryStub = join(HERE, '.build', 'registryStub.cjs');
mkdirSync(join(HERE, '.build'), { recursive: true });
// Even-numbered PRs are "tracked" (have review history); odd ones are not.
// buildBoard reads getSnapshots — the LIST — not getLatestSnapshot.
writeFileSync(registryStub, `
  const snap = (repo, n) => ({
    repo, prNumber: n, sha: 'sha' + n, reviewedAt: n,
    findings: [], resolvedFingerprints: ['a', 'b'],
  });
  exports.getSnapshots = (repo, n) => (n % 2 === 0 ? [snap(repo, n)] : []);
  exports.getLatestSnapshot = (repo, n) => (n % 2 === 0 ? snap(repo, n) : null);
  exports.prKey = (repo, n) => repo + '#' + n;
  exports.parseRepoAndNumber = (url) => {
    const m = /github\\.com\\/([^/]+)\\/([^/]+)\\/pull\\/(\\d+)/.exec(url);
    return m ? { repo: m[1] + '/' + m[2], prNumber: Number(m[3]) } : null;
  };
`);

// runSummary is pure (type-only imports), so it is transpiled and used for
// real rather than stubbed — the parsing it does is part of what this tests.
const runSummary = loadTS('src/utils/runSummary.ts');
const runSummaryPath = join(HERE, '.build', 'src_utils_runSummary.cjs');

const board = loadTS('src/services/prBoard.ts', {
  './riskRegistry': registryStub,
  '../utils/runSummary': runSummaryPath,
});
void runSummary;

const item = i => ({
  id: `https://github.com/acme/app/pull/${i}`,
  url: `https://github.com/acme/app/pull/${i}`,
  label: `PR ${i}`,
  analyzedAt: 1_700_000_000_000 + i * 1000,
  stats: { totalNodes: 5, totalEdges: 4, mismatches: 0 },
  result: {
    prTitle: `Change number ${i}`,
    risks: [
      { severity: 'critical', fingerprint: `c${i}` },
      { severity: 'high', fingerprint: `h${i}` },
      { severity: 'high', fingerprint: `h2${i}` },
      { severity: 'medium', fingerprint: `m${i}` },
    ],
  },
});

const twenty = Array.from({ length: 20 }, (_, i) => item(i + 1));

console.log('\n1. Twenty PRs build twenty rows');
const rows = board.buildBoard(twenty);
check('all 20 survive', rows.length === 20, rows.length);
check('no row is missing an id', rows.every(r => !!r.id));
check('every row got a health verdict', rows.every(r => !!r.health));

console.log('\n2. Newest first, regardless of input order');
const shuffled = [...twenty].sort(() => Math.random() - 0.5);
const sorted = board.buildBoard(shuffled);
const times = sorted.map(r => r.analyzedAt);
check('descending by analyzedAt',
  times.every((t, i) => i === 0 || times[i - 1] >= t), times.slice(0, 4).join(','));
check('same order no matter how it arrived',
  JSON.stringify(sorted.map(r => r.id)) === JSON.stringify(rows.map(r => r.id)));

console.log('\n3. Rollup arithmetic over a full board');
const totals = board.rollup(rows);
check('counts every PR', totals.prs === 20, totals.prs);
check('sums criticals (1 each)', totals.openCritical === 20, totals.openCritical);
check('sums highs (2 each)', totals.openHigh === 40, totals.openHigh);
check('counts only tracked PRs', totals.tracked === 10, totals.tracked);
check('resolved counts only from tracked PRs', totals.resolved === 20, totals.resolved);

console.log('\n4. Repo and PR number are parsed, not guessed');
check('repo parsed', rows.every(r => r.repo === 'acme/app'), rows[0].repo);
check('numbers are the real ones',
  new Set(rows.map(r => r.prNumber)).size === 20, new Set(rows.map(r => r.prNumber)).size);

console.log('\n5. One malformed entry does not take the board down');
const withJunk = [
  ...twenty.slice(0, 5),
  { id: 'junk', url: 'not-a-github-url', analyzedAt: 1, result: {} },
  ...twenty.slice(5),
];
let junkRows = null;
try { junkRows = board.buildBoard(withJunk); } catch (e) { junkRows = e; }
check('did not throw', Array.isArray(junkRows), junkRows?.message);
check('good rows still present', Array.isArray(junkRows) && junkRows.length === 21, junkRows?.length);
check('rollup still works over it',
  (() => { try { return board.rollup(junkRows).prs === 21; } catch { return false; } })());

console.log('\n6. An empty board is a board, not a crash');
check('no rows', board.buildBoard([]).length === 0);
const empty = board.rollup([]);
check('zeroed rollup',
  empty.prs === 0 && empty.openCritical === 0 && empty.tracked === 0, JSON.stringify(empty));

console.log('\n' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail === 0 ? 0 : 1);
