// Bundles the notebook engine into one classic script for JavaScriptCore: no modules, no DOM.
// Output: mac/build/engine.js, which the app bundle carries as a resource.
import { rolldown } from 'vite/rolldown';
import { fileURLToPath } from 'node:url';

const bundle = await rolldown({
  input: fileURLToPath(new URL('index.ts', import.meta.url)),
  platform: 'browser',
  treeshake: true,
});
await bundle.write({
  file: fileURLToPath(new URL('../build/engine.js', import.meta.url)),
  format: 'iife',
  // Readable stack traces in the app's log are worth more than the bytes.
  minify: false,
});
await bundle.close();
