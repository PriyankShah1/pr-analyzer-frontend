// C-vii: what the app says when the backend is not there.
//
// Driven by a REAL transport failure against a port nothing is listening on,
// so the axios error object is the genuine article rather than a hand-made
// stub that happens to match the branch being tested.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const ts = require_('typescript');
const axios = require_('axios');
const HERE = dirname(fileURLToPath(import.meta.url));

/** Transpile the hook and take only its pure helpers out of it. */
function loadHelpers() {
  const src = readFileSync(join(HERE, '..', 'src/hooks/useAnalyze.ts'), 'utf8');
  // The hook imports React and app modules that need a bundler; these helpers
  // do not. Slice them out rather than dragging the whole module in. The slice
  // starts at isTransportFailure and runs to the end of describeError, so the
  // private isTimeout between them comes along — leaving it behind made the
  // transpiled copy throw ReferenceError at the first timeout.
  const start = src.indexOf('export function isTransportFailure');
  const end = src.indexOf('\n}\n', src.indexOf('export function describeError')) + 3;
  const js = ts.transpileModule(src.slice(start, end), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const out = join(HERE, '.build');
  mkdirSync(out, { recursive: true });
  const file = join(out, 'analyzeHelpers.cjs');
  writeFileSync(file, js);
  return require_(file);
}

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  → ' + extra : '')); }
};

const { describeError, isTransportFailure } = loadHelpers();

console.log('\n1. A real connection failure against a dead port');
let realErr = null;
try {
  // 9 is reserved (discard) and nothing listens on it in this environment.
  await axios.post('http://127.0.0.1:9/analyze', { url: 'x' }, { timeout: 2500 });
} catch (e) {
  realErr = e;
}
check('the request did fail', realErr !== null);
console.log('   axios code: ' + realErr?.code);

const msg = describeError(realErr, false);
console.log('   message   : ' + msg);
check('the user is told the BACKEND is unreachable, not given a stack',
  /backend/i.test(msg), msg);
check('no raw axios internals leak into the message',
  !/ECONNREFUSED|axios|127\.0\.0\.1|stack/i.test(msg), msg);

console.log('\n2. Health is only marked down for TRANSPORT failures');
// An HTTP error means the backend answered and rejected the input — it is up.
check('a real socket failure IS a transport failure', isTransportFailure(realErr), realErr?.code);
check('a browser ERR_NETWORK is one too', isTransportFailure({ code: 'ERR_NETWORK' }));
check('an axios TIMEOUT is one too — this backend sleeps when idle',
  isTransportFailure({ code: 'ECONNABORTED' }));
check('a 404 does NOT mark the backend down',
  !isTransportFailure({ response: { status: 404, data: {} } }));
check('a 422 does NOT mark the backend down',
  !isTransportFailure({ response: { status: 422, data: {} } }));
check('a 500 does NOT mark the backend down — it answered',
  !isTransportFailure({ response: { status: 500, data: {} } }));

console.log('\n2b. A timeout reads as a cold start, not as a raw axios string');
const timeoutMsg = describeError({ code: 'ECONNABORTED', message: 'timeout of 30000ms exceeded' }, false);
console.log('   ' + timeoutMsg);
check('mentions responding in time', /respond/i.test(timeoutMsg), timeoutMsg);
check('explains the idle backend', /sleep|idle/i.test(timeoutMsg), timeoutMsg);
check('does not leak the axios wording', !/timeout of \d+ms/.test(timeoutMsg), timeoutMsg);

console.log('\n3. HTTP errors still get their own actionable message');
const cases = [
  [{ response: { status: 404, data: {} } }, false, /not found/i],
  [{ response: { status: 401, data: {} } }, false, /private repo|add your token/i],
  [{ response: { status: 401, data: {} } }, true,  /expired|scope/i],
  [{ response: { status: 403, data: {} } }, false, /forbidden|permission|rate/i],
  [{ response: { status: 429, data: { retryAfter: 30 } } }, false, /30s/],
  [{ response: { status: 422, data: { error: 'PR is too large: 96 PHP files found. Max supported is 50.' } } },
    false, /96 PHP files/],
];
for (const [err, hasToken, want] of cases) {
  const got = describeError(err, hasToken);
  check(`${err.response.status}${hasToken ? ' (with token)' : ''}: ${want}`, want.test(got), got);
}

console.log('\n4. An unknown failure still says something');
const unknown = describeError({ message: 'boom' }, false);
check('falls back to the error message', /boom/.test(unknown), unknown);
const nothing = describeError({}, false);
check('never returns empty', typeof nothing === 'string' && nothing.length > 0, nothing);

console.log('\n' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail === 0 ? 0 : 1);
