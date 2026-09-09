// Every anchor the tour points at must exist in the UI.
//
// A step whose `[data-tour]` target is gone is skipped silently at runtime —
// the tour just gets shorter and nobody notices. This turns that into a
// build-time failure.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not .pathname — a space in the project path arrives as %20.
const SRC = fileURLToPath(new URL('../src/', import.meta.url));

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(p)) files.push(p);
  }
})(SRC);

const tour = files.find(f => f.endsWith('GuidedTour.ts'));
const declared = [...readFileSync(tour, 'utf8').matchAll(/anchor:\s*'([^']+)'/g)].map(m => m[1]);

const present = new Set();
for (const f of files) {
  if (f === tour) continue;   // its own selector template is not an anchor
  const text = readFileSync(f, 'utf8');
  // Two forms carry an anchor: the attribute written directly on an element,
  // and a `dataTour="…"` prop passed to a component that sets it on its own
  // root. The prop form exists because a wrapper element would break the
  // parent's flex layout.
  for (const m of text.matchAll(/data-tour="([^"]+)"/g)) present.add(m[1]);
  for (const m of text.matchAll(/dataTour="([^"]+)"/g)) present.add(m[1]);
}

const missing = declared.filter(a => !present.has(a));
const unused = [...present].filter(a => !declared.includes(a));

console.log(`tour steps declared : ${declared.length}`);
console.log(`anchors in the UI   : ${present.size}`);
if (unused.length) console.log(`anchors with no step: ${unused.join(', ')}`);

if (missing.length) {
  console.error(`\nFAIL — no element carries: ${missing.join(', ')}`);
  process.exit(1);
}
console.log('\nall tour anchors resolve');
