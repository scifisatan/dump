import { defineConfig } from 'vite-plus';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Unit tests are plain Node code; the service worker plugin only gets in the way.
const isVitest = Boolean(process.env.VITEST);
// Vite builds only the web client. Wrangler builds and runs the API Worker (wrangler.jsonc).
const verify = ['vp lint', 'vp test', 'npm run typecheck'];

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    !isVitest &&
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
        manifest: {
          id: '/',
          name: 'Dump',
          short_name: 'Dump',
          description: 'A place for everything on your mind.',
          theme_color: '#f0f0e0',
          background_color: '#f0f0e0',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/cdn-cgi\//],
          cleanupOutdatedCaches: true,
        },
      }),
  ],
  build: { outDir: 'dist/client' },
  server: { port: 6191, strictPort: true },
  preview: { port: 6194, strictPort: true },
  run: {
    tasks: {
      // `npm run dev` runs this beside the client, as a separate origin like production, with a
      // fixed local owner key that the dev client prefills.
      api: {
        command:
          'wrangler dev --port 6190 --local-upstream localhost:6190 --var ALLOWED_CLIENT_ORIGINS:http://localhost:6191 --var OWNER_KEY:dump-local-development-owner-key',
        cache: false,
      },
      web: { command: 'vp dev', dependsOn: ['api'], cache: false },
      // A server to break: empty at every start, apart from the dev data, with the e2e owner key.
      // It allows the dev client and the e2e client, which native apps and the CLI present.
      'scratch:server': {
        command: [
          'rm -rf .wrangler/scratch-state',
          'wrangler dev --port 6195 --local-upstream localhost:6195 --persist-to .wrangler/scratch-state --env-file tests/e2e/server.env --var ALLOWED_CLIENT_ORIGINS:http://localhost:6191,http://localhost:6194',
        ],
        cache: false,
      },
      'deploy:server': { command: [...verify, 'wrangler deploy'], cache: false },
      'deploy:client': {
        command: [...verify, 'vp build', 'wrangler deploy --config wrangler.client.jsonc'],
        cache: false,
      },
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
  fmt: {
    printWidth: 100,
    singleQuote: true,
    trailingComma: 'all',
    // Astryx writes these; `astryx theme build --check` compares them byte for byte.
    ignorePatterns: [
      'package-lock.json',
      'public/**',
      'docs/**',
      '*.md',
      'src/astryx-themes.ts',
      'src/themes/*/*.{js,css,d.ts}',
    ],
  },
  lint: {
    ignorePatterns: [
      'dist/**',
      '.wrangler/**',
      'public/**',
      'test-results/**',
      'playwright-report/**',
    ],
    jsPlugins: [{ name: 'react-doctor', specifier: 'oxlint-plugin-react-doctor' }],
    rules: {
      'react-doctor/no-fetch-in-effect': 'warn',
      'react-doctor/no-derived-state-effect': 'warn',
      'react-doctor/no-array-index-as-key': 'warn',
      'react-doctor/no-event-handler': 'warn',
      'react-doctor/effect-needs-cleanup': 'warn',
    },
    // The layer rules in CODING_STANDARDS.md § Layers. The core runs in browsers, JavaScriptCore
    // and Hermes, which share no globals beyond the web APIs mac/engine/polyfills.ts and
    // mobile/src/runtime.ts provide, and no client imports the Worker.
    overrides: [
      {
        files: ['src/core/**', 'src/shared/**'],
        rules: {
          'no-restricted-globals': [
            'error',
            'window',
            'document',
            'localStorage',
            'sessionStorage',
            'indexedDB',
            'navigator',
            'location',
          ],
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  group: [
                    'react',
                    'react-*',
                    'node:*',
                    'cloudflare:*',
                    '**/client/**',
                    '**/server/**',
                  ],
                  message: 'src/core and src/shared run on every client: keep them platform-free.',
                },
              ],
            },
          ],
        },
      },
      {
        files: ['src/client/**', 'mac/engine/**', 'mobile/**', 'cli/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  group: ['**/server/**'],
                  message: 'Clients import the contracts in src/shared, never the Worker.',
                },
              ],
            },
          ],
        },
      },
    ],
  },
});
