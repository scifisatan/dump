import { defineTheme } from '@astryxdesign/core/theme';
import { matchaTheme } from '@astryxdesign/theme-matcha/built';

// Matcha's colours with Dump's lime actions and the app's self-hosted Geist. Matcha's own fonts
// come from Google, which the Content-Security-Policy blocks.
// Rebuild after editing: npx astryx theme build src/themes/dump/dumpTheme.ts
const lime = '#d8ee79';
const ink = '#30332b';
// Lime is too light to read as text on the off-white page, so accent text and icons stay olive
// in light mode.
const olive = '#526124';

export const dumpTheme = defineTheme({
  name: 'dump',
  extends: matchaTheme,
  tokens: {
    '--color-accent': [lime, lime],
    '--color-on-accent': [ink, ink],
    '--color-accent-muted': [`${lime}40`, `${lime}26`],
    '--color-text-accent': [olive, lime],
    '--color-icon-accent': [olive, lime],
  },
  // Replaces Matcha's typography whole, so its scale is repeated here.
  typography: {
    scale: { base: 16, ratio: 1.25 },
    body: {
      family: 'Geist Variable',
      fallbacks:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
    code: { family: 'SF Mono', fallbacks: 'ui-monospace, Menlo, Monaco, Consolas, monospace' },
  },
});
