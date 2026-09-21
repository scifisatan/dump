# Dump

A local-first home for your thoughts and links. The current Cloudflare deployment is public and intended for single-user use by convention.

## Run locally

Requires Node.js 22.12+ (tested with Node 24) and npm.

```powershell
cd C:\Users\abist\Documents\Dump
npm install
npm run dev
```

Open http://127.0.0.1:6191. The same process runs the client, Worker, and SQLite-backed Durable Object. Local data stays in this browser and `.wrangler/state`; it is not your production database.

## Use it

- Type a thought or URL and press Enter. Shift+Enter adds a line.
- `!buy warm floor lamp #reading` files to Buy and adds the reading tag.
- Start in Inbox or open Board to see lists side by side. Drag column handles or use their Move left/right menu buttons to reorder them.
- Create lists from the sidebar. Rename/recolor them from the list heading or board menu. Lists and their order sync across devices.
- Default prefixes: `!ideas`, `!buy`, `!watch`, `!decor`, `!todo`. Custom list names with spaces use hyphens, for example `!weekend-plans` (ASCII letters/digits/hyphens).
- Ctrl/Cmd+K opens search for thoughts, links, tags, lists, and navigation. File with each card's action menu.
- Sort inbox offers buttons and `i / b / w / d / t`, Right Arrow skips, Backspace removes.
- Done and remove are final; there is no undo. Removal leaves a hidden sync tombstone so other copies don't bring the item back.
- Settings contains Light/Dark/System appearance and backups. Export includes dumps and lists. Import restores missing IDs and keeps existing records.
- `/marketing` is the public landing page. It uses illustrative content and does not initialize the notebook on a direct visit.

Offline reload works in a built/installed version after a successful first load; the development server relies on live modules. “Saved here” and “synced” are separate states.

## Cloudflare deployment

Target: `https://dump.abishrestha.com.np`.

1. Sign in using `npx wrangler login`.
2. Run `npm run deploy`. It runs the checks, builds in production mode, and deploys through Wrangler. Custom Domain routing provisions the hostname through Cloudflare. `workers.dev` and preview URLs are disabled.
3. Verify the public hostname, phone-to-desktop sync, and offline reload/reconnect. Anyone who can reach the hostname shares the same single-user data store.

## Checks

```powershell
npm run check
npm run lint
npx playwright install chromium
npm run test:e2e
```

The E2E suite creates a local-only test build and isolated server storage. Never deploy test output manually. `npm run deploy` always replaces it with a fresh production build.

## Architecture

React/TinyBase memory state → asynchronous IndexedDB → TinyBase WebSocket synchronizer → one SQLite-backed `WsServerDurableObject`. On connect, devices compare hashes and exchange only the rows that differ; after that, edits arrive live. Open tabs sync over a BroadcastChannel. The server relays rows without validating them, so the client decodes every row with Zod and skips invalid ones. TinyBase's merge metadata persists in fragmented SQLite storage. Domain records are atomic cells, so conflicting edits choose one complete version. The public deployment has no application authentication.

This is an initial personal release. Sync needs WebSockets; networks that block them leave changes saved on the device until you reconnect elsewhere. There is no AI, native share extension, email capture, or scheduled R2 backup yet. JSON export/import is the current manual backup path. No cloud restore drill or physical-phone validation is claimed.

## UI foundation and migration

The UI uses shadcn/Radix components, cmdk search, dnd-kit column sorting, next-themes, and React Router. The lime asterisk logo is preserved; the theme uses neutral surfaces and lime accents. List colors are category accents. The architectural review and Jev proposal are in [docs/architecture-review.md](docs/architecture-review.md).

The app has not reached production, so there is no schema versioning or backwards compatibility.

Column order syncs; cards remain newest-first and move through their menus. Per-card dragging/order, selecting a subset of board columns, list archiving, semantic search, and Jev classification are not implemented. Authentication is deferred and the deployment remains public.
