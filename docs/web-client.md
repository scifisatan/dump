# Web client

Owns `src/client/`, `index.html`, `public/` and `wrangler.client.jsonc`. For what users see and do, read README § Using Dump. Notebook behavior (commands, filing, profiles) lives in [core.md](core.md).

## Stack and entry points

- React with React Router, Tailwind v4 (tokens and custom variants in `src/client/styles.css`), shadcn/Radix primitives in `components/ui/`, cmdk search, next-themes (Light, Dark, System), lucide-react, sonner, vite-plugin-pwa. Vite builds the client to `dist/client/`.
- `main.tsx` picks the screen and lazy-loads `App.tsx` (the notebook) or `Marketing.tsx` (the landing page). `store.ts` runs the core's session for the active profile, whose switches reload the page, and exposes `useDumpStore`. `browser-platform.ts` is the browser adapter: IndexedDB, WebSocket, BroadcastChannel and device events. `profiles.ts` keeps the core's notebook registry and the owner keys in localStorage. `registry.ts` answers whether this browser has a notebook.
- `App.tsx` is the client's largest file: the shell, top bar, views and composer are all in it. Grep for the piece you need instead of reading the whole file.

## Views and look

- No sidebar: the top bar holds the logo (the badge alone on a phone), Sort inbox while unfiled dumps wait, and search with Settings; a list or Done shows a back arrow, its name and count instead. The rest opens from search (⌘K) or a card's list name. → e2e `app.spec.ts` "the top bar holds the logo", "mobile layout fits and lists open from search"
- Sync shows only when it needs attention ([core.md § Views](core.md#views)): its state beside Settings, with Retry or Sign in, and a dot on the gear. Screen readers always hear it through the same `role="status"`. → e2e `app.spec.ts` "two devices merge offline captures"
- The views are home (`/`), one per list, and Done; any other path shows home. Each reads like a chat, newest at the bottom above a pinned composer. Done has no composer; an empty view centers a larger one. → e2e `app.spec.ts` "a path that names no view shows home"
- Home ends in Today ([core.md § Data model](core.md#data-model)) under a "done" link. An empty Today says "A clear day." and offers example dumps that fill the composer. → e2e `app.spec.ts` "Today shows what is overdue", `connections.spec.ts` "a device-only notebook never contacts a server"
- Home opens at Today's heading when Today is taller than the screen, so today comes first; other views open at their newest dump, and new dumps scroll into view. → e2e `app.spec.ts` "home opens at Today’s heading"
- The composer shows the day it read from the draft; its × dumps without one. A card's day and its menu offer the same choices. → e2e `app.spec.ts` "Today shows what is overdue"
- Backups live in Settings. Clear done and Delete list take a confirm click, since there is no undo. → e2e `app.spec.ts` "prefix filing, search, export", "clearing done removes every completed dump", "deleting a list takes a confirm click"
- Keep the lime asterisk badge, the off-white and charcoal surfaces, and the lime actions. A list's color is a category accent, not a theme. → no test: compare the screenshots e2e saves in `test-results/`.
- Motion uses opacity and transform at 120–180ms and honors reduced motion. Every gesture also has a button. The keyboard height and the loading loop are deliberate exceptions, below. → no test: review CSS changes against it.

## First run, onboarding, owner keys

- `/` (and any notebook path) shows the notebook if this browser has one, else the landing page. `hasNotebook` (`registry.ts`, dependency-free) decides synchronously from localStorage, so there is no redirect and returning visitors never load landing or onboarding code. `/marketing` never initializes the notebook. → e2e `app.spec.ts` "a returning visitor opens the notebook at /", "marketing is separate", `connections.spec.ts` "a new visitor gets the landing page in place"
- Onboarding (`components/Onboarding.tsx`) saves nothing until the server accepts the owner key (`POST /api/sync-ticket`) or the visitor picks this device only. Settings (`ServerSettings.tsx`, `ServerConnection.tsx`) can connect later, checking the key before `reconnect()`. → e2e `connections.spec.ts` "a new visitor gets the landing page", "a device-only notebook never contacts a server"
- A device-only notebook asks for persistent storage. → no test: headless Chromium answers silently.
- The profile registry is localStorage `dump-connections`; owner keys sit under `dump-owner-key:<profile-id>`. → e2e `connections.spec.ts` "a new visitor gets the landing page", "a device whose key stops working"

## Content Security Policy

The static host sends a CSP from `public/_headers` that allows only the app's own scripts. Keep the client free of inline and third-party scripts; this is why `public/theme-init.js` is a separate file. → e2e `app.spec.ts` "…under the CSP"

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
