import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => ({
  resolve: { alias: { '@': fileURLToPath(new URL('./src/client', import.meta.url)) } },
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({
      persistState: { path: mode === 'test' ? '.wrangler/test-state' : '.wrangler/state' },
      inspectorPort: false,
    }),
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
  server: { port: 6191, strictPort: true },
}));
