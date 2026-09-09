// C-v: the PNG export cap on a large graph.
//
// The old expression clamped the scale UP to 1:
//
//   Math.max(1, Math.min(2 * dpr, MAX / longestSide))
//
// which defeated the cap on exactly the graphs it existed to protect. A graph
// longer than MAX needs a scale BELOW 1 — that is what "shrink to fit" means —
// and forcing it back to 1 produced a canvas past the browser's limit, where
// toDataURL returns a blank image. The export looked like it worked.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const ts = require_('typescript');
const HERE = dirname(fileURLToPath(import.meta.url));

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

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  → ' + extra : '')); }
};

const { computeExportScale, willDownscale, MAX_EXPORT_DIMENSION } =
  loadTS('src/utils/exportScale.ts');

const MAX = MAX_EXPORT_DIMENSION;

console.log('\n1. A normal graph supersamples for sharpness');
check('1200x800 @dpr1 → 2x', computeExportScale(1200, 800, 1) === 2, computeExportScale(1200, 800, 1));
check('1200x800 @dpr2 → 4x', computeExportScale(1200, 800, 2) === 4, computeExportScale(1200, 800, 2));
check('not flagged as downscaled', willDownscale(1200, 800) === false);

console.log('\n2. THE BUG: a graph past the cap must scale BELOW 1');
const huge = computeExportScale(20000, 3000, 1);
check('scale is below 1', huge < 1, huge);
check('resulting canvas fits the cap',
  20000 * huge <= MAX + 0.001, 20000 * huge);
check('flagged as downscaled', willDownscale(20000, 3000) === true);

console.log('\n3. The cap binds on the LONGEST side, either axis');
const tall = computeExportScale(3000, 20000, 1);
check('tall graph also shrinks', tall < 1, tall);
check('tall canvas fits', 20000 * tall <= MAX + 0.001, 20000 * tall);

console.log('\n4. Exactly at the cap');
const at = computeExportScale(MAX, 500, 1);
check('scale is exactly 1 at the cap', at === 1, at);
check('not flagged as downscaled at the cap', willDownscale(MAX, 500) === false);
check('one pixel over IS flagged', willDownscale(MAX + 1, 500) === true);

console.log('\n5. A high-DPR screen never pushes past the cap');
for (const dpr of [1, 2, 3]) {
  const s = computeExportScale(9000, 9000, dpr);
  check(`dpr ${dpr}: canvas within cap`, 9000 * s <= MAX + 0.001, 9000 * s);
}

console.log('\n6. Degenerate input does not produce NaN or 0');
for (const [w, h] of [[0, 0], [-5, -5], [NaN, 10], [Infinity, 10]]) {
  const s = computeExportScale(w, h, 1);
  check(`(${w},${h}) → finite positive`, Number.isFinite(s) && s > 0, s);
}

console.log('\n' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail === 0 ? 0 : 1);
