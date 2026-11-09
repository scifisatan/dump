// Runs the checks a change reaches, and only those: it reads the changed paths, works out which
// targets they reach (docs/architecture.md § Code layers and seams), runs those targets' checks
// in parallel, and prints one line per check plus the end of any failure's output.
//
//   npm run verify                  changes against HEAD, staged or not, and untracked files
//   npm run verify -- --base main   everything since this branch left main
//   npm run verify -- --all         every check
//   npm run verify -- --e2e         also the Playwright suite, when the change reaches it
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('..', import.meta.url));
const { values } = parseArgs({
  options: {
    base: { type: 'string', default: 'HEAD' },
    all: { type: 'boolean', default: false },
    e2e: { type: 'boolean', default: false },
  },
});

const git = (...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
const base = values.base === 'HEAD' ? 'HEAD' : git('merge-base', values.base, 'HEAD')[0];
const changed = values.all
  ? []
  : [
      ...new Set([
        ...git('diff', '--name-only', base),
        ...git('ls-files', '--others', '--exclude-standard'),
      ]),
    ];

// Where each path's code runs. A path can reach several targets; the core reaches every client.
const reach = [
  [/^src\/shared\//, ['web', 'worker', 'mac', 'mobile', 'cli']],
  [/^src\/core\//, ['web', 'mac', 'mobile', 'cli']],
  [/^(src\/client\/|index\.html|public\/|wrangler\.client\.jsonc)/, ['web']],
  [/^(src\/server\/|wrangler\.jsonc)/, ['worker']],
  [/^mac\//, ['mac']],
  [/^mobile\//, ['mobile']],
  [/^cli\//, ['cli']],
  [/^tests\/e2e\//, ['e2e']],
  [/^tests\//, ['tests']],
  [/^(package(-lock)?\.json|vite\.config\.ts|tsconfig[^/]*\.json|scripts\/)/, ['everything']],
  [/(^|\/)[^/]+\.md$/, ['docs']],
];
const targets = new Set(values.all ? ['everything'] : []);
for (const path of changed)
  for (const [pattern, reached] of reach)
    if (pattern.test(path)) reached.forEach((t) => targets.add(t));
const every = targets.has('everything');
const reaches = (...names) => every || names.some((name) => targets.has(name));

// The project's own files: the change, or with every check, everything git tracks too. Editor
// folders such as .vscode/ are never checked.
const formatted = [...new Set([...(every ? git('ls-files') : []), ...changed])].filter(
  (path) =>
    existsSync(`${root}/${path}`) &&
    /\.(ts|tsx|mjs|js|json|jsonc|css)$/.test(path) &&
    /^(src|cli|tests|scripts|mac\/engine|mobile\/src|mobile\/[^/]+$|[^/]+$)/.test(path),
);
const code = reaches('web', 'worker', 'mac', 'mobile', 'cli', 'tests', 'e2e');

const checks = [
  ['format', `npx vp fmt --check ${formatted.join(' ')}`, formatted.length > 0],
  ['lint', 'npx vp lint --quiet', code],
  ['unit + docs', 'npx vp test', true],
  ['types: web', 'npx tsc -p tsconfig.client.json', reaches('web')],
  ['types: worker', 'npx tsc -p tsconfig.json', reaches('worker')],
  ['types: mac engine', 'npx tsc -p mac/engine/tsconfig.json', reaches('mac')],
  ['types: cli', 'npx tsc -p cli/tsconfig.json', reaches('cli')],
  ['types: tests', 'npx tsc -p tests/tsconfig.json', code],
  ['types: phone', 'npm --prefix mobile run -s typecheck', reaches('mobile')],
  ['build: web', 'npx vp build', reaches('web')],
  ['build: worker', 'npx wrangler deploy --dry-run --outdir dist/server', reaches('worker')],
  ['swift', 'npm run -s mac:engine && cd mac && swift build -q && swift test -q', reaches('mac')],
  ['e2e', 'npx playwright test --reporter=line', values.e2e && reaches('web', 'worker', 'e2e')],
].filter(([, , run]) => run);

// What this run could not see, so it is never mistaken for a pass.
const unseen = [
  [
    !values.e2e && reaches('web', 'worker', 'e2e'),
    'e2e not run: add --e2e (needs ports 6192–6194 free)',
  ],
  [reaches('mac'), 'Swift UI has no tests: docs/mac.md § Seeing the UI'],
  [reaches('mobile'), 'phone screens and Hermes have no tests: docs/mobile.md'],
  [
    reaches('docs') && !code,
    'docs only: tests/docs.test.ts checks links, tests and paths, not wording',
  ],
].filter(([shown]) => shown);

const list = values.all
  ? 'every check'
  : `${changed.length} changed ${changed.length === 1 ? 'path' : 'paths'}`;
console.log(`${list} → ${every ? 'everything' : [...targets].join(', ') || 'nothing to check'}`);
if (changed.length === 0 && !values.all) process.exit(0);

const plain = (text) => text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
function run([name, command]) {
  const started = Date.now();
  return new Promise((done) => {
    const child = spawn(command, {
      cwd: root,
      shell: true,
      env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('close', (status) => {
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      const lines = plain(output)
        .split('\n')
        .filter((line) => line.trim());
      console.log(`${status === 0 ? '✓' : '✗'} ${name} ${seconds}s`);
      if (status !== 0)
        console.log(
          lines
            .slice(-40)
            .map((line) => `    ${line}`)
            .join('\n'),
        );
      done(status === 0);
    });
  });
}

// Swift and the web build are heavy, so at most four checks run at once.
const queue = [...checks];
const results = [];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let check = queue.shift(); check; check = queue.shift())
      results.push([check[0], await run(check)]);
  }),
);
for (const [, note] of unseen) console.log(`· ${note}`);
const failed = results.filter(([, passed]) => !passed).map(([name]) => name);
console.log(failed.length ? `FAIL: ${failed.join(', ')}` : 'PASS');
process.exit(failed.length ? 1 : 0);
