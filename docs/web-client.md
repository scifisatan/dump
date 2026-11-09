# Web client

Owns `src/client/`, `index.html`, `public/` and `wrangler.client.jsonc`. For what users see and do, read README § Using Dump. Notebook behavior (commands, filing, profiles) lives in [core.md](core.md).

## Stack and entry points

- React with React Router, Tailwind v4 (tokens and custom variants in `src/client/styles.css`), shadcn/Radix primitives in `components/ui/`, cmdk search, next-themes (Light, Dark, System), lucide-react, sonner, vite-plugin-pwa. Vite builds the client to `dist/client/`.
- `main.tsx` picks the screen and lazy-loads `App.tsx` (the notebook) or `Marketing.tsx` (the landing page). `store.ts` runs the core's session for the active profile, whose switches reload the page, and exposes `useDumpStore`. `browser-platform.ts` is the browser adapter: IndexedDB, WebSocket, BroadcastChannel and device events. `profiles.ts` keeps the core's notebook registry and the owner keys in localStorage. `registry.ts` answers whether this browser has a notebook.
- `App.tsx` is the client's largest file: the shell, top bar, views and composer are all in it. Grep for the piece you need instead of reading the whole file.

## Views and look

- There is no sidebar. The top bar holds the logo (the badge alone on a phone), Sort inbox when unfiled dumps wait for the owner, and search and Settings grouped together. Sync shows only when it needs attention (offline, paused, signed out, or unable to save): its state beside Settings, with Retry or Sign in, and a dot on the gear. Screen readers always hear the state through the same `role="status"` element. → e2e `app.spec.ts` "two devices merge offline captures" Lists, Done, New list and Today open from search (⌘K); a card's list name opens its list. A list or Done shows a back arrow, its name and its count in place of the logo. → e2e `app.spec.ts` "mobile layout fits and lists open from search"
- There are three kinds of view: home (`/`, every open dump in one list), one view per list, and Done. A path that names no view shows home. Each view is a compact list of dumps with the newest at the bottom and a composer pinned below like a chat. Done has no composer. An empty list or Done centers a larger composer instead of pinning it. Home always ends in Today; an empty Today says "A clear day." and offers example dumps with days, each of which fills the composer. → e2e `connections.spec.ts` "a device-only notebook never contacts a server"
- Home ends in Today, just above the composer, grouped as [core.md § Data model](core.md#data-model) describes: older undated dumps by the day they were captured, a "done" link at the very top, then Today's heading and its sections, each shown only when it has dumps. → e2e `app.spec.ts` "Today shows what is overdue"
- Home opens with Today's heading at the top of the screen when Today is taller than the screen, and at the bottom otherwise. The other views open at their newest dump. New dumps scroll into view. → no test: the e2e tests don't measure scroll position.
- While you type, the composer shows the day it read from the draft (see [core.md § Data model](core.md#data-model)), and its × sends the dump without a date. A dated dump shows its day on its card, red when overdue. The day and the card's menu both offer Today, Tomorrow, Pick a day… and Clear date.
- Backups (export and import) live in Settings. Clear done and Delete list both need a confirm click.
- Keep the lime asterisk badge, the off-white and charcoal surfaces, and the lime actions. Each list's color is only a category accent, not a theme.
- Motion uses opacity and transform at 120–180ms and honors reduced motion. Every gesture also has an accessible button. There are two deliberate exceptions, described below: the keyboard height transition and the loading screen's loop.

## First run, onboarding, owner keys

- `/` (and any notebook path) shows the notebook if this browser has a saved notebook, and the landing page otherwise. The decision is made synchronously from localStorage (`hasNotebook`, `registry.ts`, which stays dependency-free). There is no redirect, and returning visitors never load landing or onboarding code. `/marketing` stays reachable and never initializes the notebook. → e2e `app.spec.ts` "a returning visitor opens the notebook at /", `connections.spec.ts` "a new visitor gets the landing page in place"
- Onboarding (`components/Onboarding.tsx`) saves nothing until the server accepts the owner key (checked with `POST /api/sync-ticket`) or the visitor chooses this device only. A device-only notebook asks the browser for persistent storage. Settings (`ServerSettings.tsx`, `ServerConnection.tsx`) can connect a server later, and verifies a new key before calling `reconnect()`.
- The profile registry is stored under localStorage `dump-connections`. Owner keys are stored outside it, under `dump-owner-key:<profile-id>`.

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
