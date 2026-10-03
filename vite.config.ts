import { defineConfig } from 'vite-plus';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

// Unit tests are plain Node code; the service worker plugin only gets in the way.
const isVitest = Boolean(process.env.VITEST);
// Vite builds only the web client. Wrangler builds and runs the API Worker (wrangler.jsonc).
const verify = ['vp lint', 'vp test', 'npm run typecheck'];

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src/client', import.meta.url)) } },
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
          theme_color: '#f7f7f5',
          background_color: '#f7f7f5',
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
    ignorePatterns: ['package-lock.json', 'public/**', 'docs/**', '*.md'],
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
  },
});
