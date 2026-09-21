# Dump — project context

## Product
One person's capture-first app for thoughts and links. Capture immediately; organize optionally. The owner is Abi. Production hostname: `dump.abishrestha.com.np`. The current deployment is intentionally public; there is no application authentication. This is a single package, not a monorepo.

## Requirements
- Capture updates the TinyBase memory store and UI synchronously. IndexedDB persistence is asynchronous; surface failures. Network serialization, requests, and AI must run after the capture handler returns.
- TinyBase owns conflict resolution through its hybrid logical clocks. `updated_at` is application metadata, never a competing merge clock.
- Each dump is an atomic JSON cell. Domain schema and codecs live in `src/shared/schema.ts`. Soft-delete with a `deleted` tombstone; never physically remove rows without a deliberate migration/compaction design.
- Sync uses TinyBase's built-in WebSocket synchronizer: `createWsSynchronizer` on the client, `WsServerDurableObject` on the server (`/api/sync`). Peers compare hashes and exchange only differing rows; live edits relay to open devices. Tabs sync with `createBroadcastChannelSynchronizer`. Do not build a custom sync protocol on top.
- Preserve merge metadata across SQLite persistence, restarts, and schema changes. The sync server relays rows without inspecting them, so every reader decodes rows through `readRows` (`src/shared/merge.ts`) and skips any that fail validation.
- Production is intentionally public. Do not add application authentication without revisiting the product decision and deployment threat model.
- No custom passwords, accounts, sessions, multi-tenancy, D1, Postgres, or application KV database.
- Conflict policy: the latest change wins, including edits made offline. The owner uses one device at a time and connects to sync; there is no manual-precedence or revision-conditional merge. Keep live sync between open tabs and devices.
- No undo. Done, filing, and remove are final; removal still writes a `deleted` tombstone so other copies do not resurrect the item.
- Future AI may propose/file/tag, never delete or rewrite original text. Durable retry state is required; `waitUntil` alone is insufficient.
- Motion uses opacity/transform at 120–180ms, honoring reduced motion. Preserve accessible buttons as alternatives to gestures.

## Stack and layout
React, Vite, Cloudflare Vite plugin, Tailwind v4, TinyBase, Zod, Hono, motion, lucide-react, sonner, date-fns. One SQLite-backed `DumpDO`, addressed by `idFromName('me')`.

`src/shared`: domain schema, API contract, store factory and validated row reading.
`src/client`: responsive app, local state/persistence, sync, styles.
`src/server`: Hono routes and SQLite-backed Agent.
`scripts`: deployment and account checks. `tests`: unit and Playwright integration tests.

Client and Worker compile separately (`tsconfig.client.json`, `tsconfig.json`). Browser code imports the shared API contract, not Worker implementation types.

## Commands
`npm run dev` — client, Worker, DO at http://127.0.0.1:6191.
`npm run check` — format check, lint, domain/merge tests, type checks, production build.
`npm run format` — format the repo with oxfmt (config in `.oxfmtrc.json`).
`npm run lint` — Oxlint plus React Doctor's per-file React diagnostics.
`npm run test:e2e` — local test build on port 6192, isolated `.wrangler/test-state` storage.
`npm run deploy` — check, build production, and deploy to the configured custom domain.
`npm run typegen` — regenerate Worker binding types when needed.

Never deploy a `--mode test` build. The deployment script always rebuilds production.

## Code quality guardrails

The repository uses the vendored anti-slop principles from dmmulroy/anti-slop: keep boundary parsing explicit, do not widen known values to `unknown` and assert them back, avoid unchecked dictionary contracts, avoid module mocks, and justify any necessary non-const type assertion with a nearby `// SAFETY:` comment. These are review rules for future changes; they are deliberately kept in project guidance because anti-slop is intended to be vendored and locally maintained rather than pulled as an opaque npm dependency.

React Doctor is enabled through Oxlint for effect cleanup, derived state, event-handler effects, array-index keys, and fetch-in-effect checks. Warnings are reviewed during `npm run lint`; they do not block this initial slice until the baseline is clean.

## Current slice and limitations
Capture, explicit list prefixes, hashtags, URL detection, lists, search, done, simple triage, IndexedDB, offline production shell, live WebSocket sync, export/additive import.

UI first pass: shadcn/Radix primitives, cmdk search palette, next-themes Light/Dark/System, React Router, and dnd-kit board column ordering. Inbox stays the default. `/board` shows lists together; `/marketing` is a separate lazy page that does not initialize the notebook on a direct visit. Backups live in Settings. Preserve the lime asterisk badge, off-white/charcoal surfaces, and lime actions; do not reintroduce a global lavender theme. Individual list colors remain category accents.

Lists are now synced atomic JSON records with stable IDs and numeric positions. Not yet in production, so there is no schema versioning or backwards compatibility; change formats in place. IndexedDB keeps the name `dump-v1`. Cards remain newest-first; card dragging/order and list archiving are pending. Authentication was explicitly deferred by the owner. See `docs/architecture-review.md` for remaining risks and the Jev proposal; AI is not enabled.

Sync has no snapshot size limit: only differing rows travel, and large messages are fragmented. Sync requires WebSockets; there is no HTTP fallback. Import is additive: it restores missing IDs and does not rewind existing records. Simultaneous edits of the same item converge to one whole-item winner; this is not collaborative text editing. Local development and production are different origins and have different local copies. Export/import transfers data.

Pending: actual-phone share-surface evaluation, AI, durable AI jobs, scheduled digest, email ingestion, R2 backup/restore, link unfurling, advanced gestures, and broader browser/device testing. Do not claim these are complete.

Deploy a working increment after meaningful checks. Keep public deployment status explicit in product and operations documentation.
