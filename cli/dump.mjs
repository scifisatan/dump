// Bundles cli/index.ts with the core, as mac/engine/build.mjs does for the Mac, and runs it.
import { fileURLToPath } from 'node:url';
import { rolldown } from 'vite/rolldown';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = fileURLToPath(new URL('../node_modules/.cache/dump-cli/index.mjs', import.meta.url));
const bundle = await rolldown({
  input: fileURLToPath(new URL('index.ts', import.meta.url)),
  platform: 'node',
  logLevel: 'warn',
});
await bundle.write({ file: output, format: 'esm' });
await bundle.close();
process.env.DUMP_ROOT = root;
await import(output);
