import { defineConfig } from 'vite-plus';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

// Unit tests are plain Node code; the Worker runtime and service worker plugins only get in the way.
const isVitest = Boolean(process.env.VITEST);

export default defineConfig(({ mode }) => ({
  resolve: { alias: { '@': fileURLToPath(new URL('./src/client', import.meta.url)) } },
  plugins: [
    react(),
    tailwindcss(),
    !isVitest &&
      cloudflare({
        persistState: { path: mode === 'test' ? '.wrangler/test-state' : '.wrangler/state' },
        inspectorPort: false,
      }),
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
          navigateFallbackDenylist: [/^\/api\//, /^\/cdn-cgi\//],
          cleanupOutdatedCaches: true,
        },
      }),
  ],
  server: { port: 6191 },
  preview: { port: 6192 },
  run: {
    tasks: {
      // Always rebuild for production; never deploy a `--mode test` build.
      deploy: {
        command: [
          'vp lint',
          'vp test',
          'npm run typecheck',
          'vp build --mode production',
          'wrangler deploy',
        ],
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
}));
