# Web client

Owns `src/client/`, `index.html`, `public/` and `wrangler.client.jsonc`. For what users see and do, read README § Using Dump. Notebook behavior (commands, filing, profiles) lives in [core.md](core.md).

## Stack and entry points

- React with React Router, the Astryx design system (`@astryxdesign/core`, see [Design system](#design-system)), Tailwind v4 for the few layout utilities Astryx props don't cover, lucide-react icons, vite-plugin-pwa. Vite builds the client to `dist/client/`.
- `main.tsx` picks the screen and lazy-loads `App.tsx` (the notebook) or `Marketing.tsx` (the landing page). `store.ts` runs the core's session for the active profile, whose switches reload the page, and exposes `useDumpStore`. `browser-platform.ts` is the browser adapter: IndexedDB, WebSocket, BroadcastChannel and device events. `profiles.ts` keeps the core's notebook registry and the owner keys in localStorage. `registry.ts` answers whether this browser has a notebook.
- `App.tsx` is large (about 780 lines): the shell, top bar, views and composer are all in it. Grep for the piece you need instead of reading the whole file.

## Views and look

- No sidebar: the top bar holds the logo (the badge alone on a phone), Sort inbox while unfiled dumps wait, and search with Settings; a list or Done shows a back arrow, its name and count instead. The rest opens from search (⌘K) or a card's list name. → e2e `app.spec.ts` "the top bar holds the logo", "mobile layout fits and lists open from search"
- Sync shows only when it needs attention ([core.md § Views](core.md#views)): its state beside Settings, with Retry or Sign in, and a dot on the gear. Screen readers always hear it through the same `role="status"`, named "Sync status" because every Astryx button carries its own status region. → e2e `app.spec.ts` "two devices merge offline captures"
- The views are home (`/`), one per list, and Done; any other path shows home. Each reads like a chat, newest at the bottom above a pinned composer. Done has no composer; an empty view centers a larger one. → e2e `app.spec.ts` "a path that names no view shows home"
- Home ends in Today ([core.md § Data model](core.md#data-model)) under a "done" link. An empty Today says "A clear day." and how to give a dump a day. Empty states carry a small icon and no buttons: the composer is the only action. → e2e `app.spec.ts` "Today shows what is overdue", `connections.spec.ts` "a device-only notebook never contacts a server"
- Home opens at Today's heading when Today is taller than the screen, so today comes first; other views open at their newest dump, and new dumps scroll into view. → e2e `app.spec.ts` "home opens at Today’s heading"
- The composer shows the day it read from the draft; its × dumps without one. A card's day and its menu offer the same choices. → e2e `app.spec.ts` "Today shows what is overdue"
- Backups live in Settings. Clear done and Delete list take a confirm click, since there is no undo. → e2e `app.spec.ts` "prefix filing, search, export", "clearing done removes every completed dump", "deleting a list takes a confirm click"
- Keep the lime asterisk badge and the lime actions on Matcha's cream (light) and near-black (dark) surfaces. A list's color is a category accent, not a theme. → no test: compare the screenshots e2e saves in `test-results/`.
- Motion uses opacity and transform at 120–180ms and honors reduced motion. Every gesture also has a button. The keyboard height and the loading loop are deliberate exceptions, below. → no test: review CSS changes against it.

## Design system

- Every screen is built from Astryx components (`npx astryx component <Name>` prints a component's props). Raw elements remain only where Astryx has nothing: the list colour swatches and `ListDot` (each list's colour is data, painted inline), the `Brand` badge, the hidden username field that lets password managers keep one key per server, and the backup file input. No test checks this; `npx astryx doctor --built .` reviews it.
- The look comes from the local `dump` theme (`src/themes/dump/dumpTheme.ts`), which extends Matcha: Dump's lime for actions (accent text and icons stay olive in light mode, where lime is unreadable) and Geist, bundled through `dump.fonts.css`, in place of Matcha's Google-hosted fonts, which the CSP blocks. It also gives cards the container radius (18px) where Matcha uses the page radius (42px); buttons stay pills. Its type scale (base 16, ratio 1.25) makes `2xs` 8px, so the smallest text in the app is `size="xsm"` (10px). After editing the source, run `npx astryx theme build src/themes/dump/dumpTheme.ts`. `npx astryx theme` commands regenerate `src/astryx-themes.ts`; never edit it by hand. The theme's background colours are repeated in `index.html` (loading screen, `theme-color`) and the manifest in `vite.config.ts`, so change them together. No test checks the theme.
- Light, Dark and System live in `lib/colorMode.ts`: it stores the choice under localStorage `dump-theme`, sets the `light`/`dark` class on `<html>` like `public/theme-init.js` does before first paint, and gives `<Theme>` the resolved mode. → e2e `app.spec.ts` "dialogs center, restore focus, and theme preference survives reload"
- `styles.css` declares the cascade-layer order first, so Tailwind utilities sit above Astryx's styles, and imports Astryx's Tailwind bridge, which turns classes like `text-primary`, `bg-muted` and `bg-accent-bg` into theme tokens. It pins Tailwind's spacing unit to 4px: the spacing utilities left are fixed geometry (dots, the badge, the reading column, the keyboard-pinned composer), while Astryx components take spacing from the theme through props.
- `cn` (`lib/utils.ts`) only joins class names; it doesn't resolve conflicts, so a component that needs a variant takes a prop for it (`Brand size`, `ListDot size`).
- Toasts come from `toast()` in `lib/toast.tsx`, which code outside React (the service-worker update prompt) can call too; they sit at the top end below the top bar. Astryx repeats each toast in a hidden announcement, so tests look for toast text inside the Notifications region.
- Links go through `components/RouterLink.tsx` (Astryx's `LinkProvider` in `main.tsx`), so app paths navigate without a reload.
- Astryx's closed menus stay in the DOM, hidden; a dump card's text therefore includes its menu's labels, and tests check the card's list chip ("Open Ideas") rather than its text.
- Astryx centers dialogs and clears the palette's highlight on every query. The ⌘K palette is pinned near the top instead, so its field stays still while results change, and `QueryInput` (`components/SearchDialog.tsx`) highlights a typed query's first match, so Enter opens it even before the search settles. Other dialogs are centered. → e2e `app.spec.ts` "dialogs center, restore focus, and theme preference survives reload"
- Form fields don't use `isRequired`: it prints a "Required" tag, and every form here already disables its button until the field is filled. No test checks this.

## First run, onboarding, owner keys

- `/` (and any notebook path) shows the notebook if this browser has one, else the landing page. `hasNotebook` (`registry.ts`, dependency-free) decides synchronously from localStorage, so there is no redirect and returning visitors never load landing or onboarding code. `/marketing` never initializes the notebook. → e2e `app.spec.ts` "a returning visitor opens the notebook at /", "marketing is separate", `connections.spec.ts` "a new visitor gets the landing page in place"
- Onboarding (`components/Onboarding.tsx`) saves nothing until the server accepts the owner key (`POST /api/sync-ticket`) or the visitor picks this device only. Settings (`ServerSettings.tsx`, `ServerConnection.tsx`) can connect later, checking the key before `reconnect()`. → e2e `connections.spec.ts` "a new visitor gets the landing page", "a device-only notebook never contacts a server"
- A device-only notebook asks for persistent storage. → no test: headless Chromium answers silently.
- The profile registry is localStorage `dump-connections`; owner keys sit under `dump-owner-key:<profile-id>`. → e2e `connections.spec.ts` "a new visitor gets the landing page", "a device whose key stops working"

## Content Security Policy

The static host sends a CSP from `public/_headers` that allows only the app's own scripts. Keep the client free of inline and third-party scripts; this is why `public/theme-init.js` is a separate file. Fonts and stylesheets must be self-hosted too (`font-src 'self'`), so bundle fonts with `@fontsource` instead of linking a font service. → e2e `app.spec.ts` "…under the CSP"

## Phone keyboard

- The app shell is `position: fixed` to the visual viewport rather than `h-dvh`. iOS overlays the keyboard without resizing the layout viewport, and it ignores `interactive-widget=resizes-content` (still set in `index.html` for Android).
- `useVisualViewport` (`lib/viewport.ts`) writes `--vv-height` and `--vv-top` on the root element, and sets `data-keyboard` while the keyboard is open (the Tailwind `keyboard:` variant). On touch devices it predicts the height on focus and blur from the last measured keyboard height, which it remembers in localStorage. That lets the layout move with the keyboard; it then corrects to the real measurement. Pinch zoom is ignored.
- The height transition uses iOS's keyboard curve (250ms), a deliberate exception to the motion rule.
- Composer submit buttons call `preventDefault` on pointerdown, so tapping them keeps focus and the keyboard open. `html` and `body` disable overscroll.
- A desktop browser can't raise an iOS keyboard. To simulate one, set `--vv-height` and `data-keyboard` on `document.documentElement` by hand. In a hidden preview pane, CSS transitions freeze at time 0; step through them with `document.getAnimations()` and `currentTime`. → no test: the keyboard handling hasn't been checked on a real phone.

## Loading screen

- `#boot` in `index.html` is a CSS-only loading screen that covers the page from first paint. `public/theme-init.js` applies the saved theme before paint, so neither the loading screen nor the app flashes the wrong colors.
- `boot.ts` keeps the screen up while anything holds it: the page load until React's first commit, the root Suspense fallback while a screen's code loads, and App until the notebook's local data is ready.
- It appears only after 200ms, then stays for at least 500ms, so fast loads show nothing and slow ones never flicker. After 2s and again after 10s it adds reassurance text.
- Its looping turn is a deliberate exception to the motion rule; with reduced motion it shows a static mark. The error boundary dismisses it. → e2e `app.spec.ts` "a slow load shows the loading screen"

## Known risk

The views split the dumps once per snapshot, but search mounts every candidate. See [core.md § Known risk](core.md#known-risk-capture-cost-grows-with-the-data).
