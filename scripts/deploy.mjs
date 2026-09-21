import { spawnSync } from 'node:child_process';

function run(file, args = []) {
  const result = spawnSync(process.execPath, [file, ...args], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

try {
  console.log('Building production for the public deployment.');
  run('node_modules/oxlint/bin/oxlint', ['-c', '.oxlintrc.jsonc', 'src', 'tests', 'scripts']);
  run('node_modules/vitest/vitest.mjs', ['run']);
  run('node_modules/typescript/bin/tsc', ['-p', 'tsconfig.client.json']);
  run('node_modules/typescript/bin/tsc', ['-p', 'tsconfig.json']);
  run('node_modules/vite/bin/vite.js', ['build', '--mode', 'production']);
  run('node_modules/wrangler/bin/wrangler.js', ['deploy']);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
