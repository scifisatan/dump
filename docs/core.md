# Core: data, sync, commands, filing, connections

Owns `src/shared/` and `src/core/`. These are the platform-independent parts that the web client, the Worker and the Mac app share. For the diagrams and the reasoning behind these choices, read [architecture.md](architecture.md).

## Layout

- `src/shared/` is imported by the client, the Worker and the Mac engine:
  - `schema.ts`: Zod codecs for dumps, lists and backups, plus the TinyBase table schema.
  - `merge.ts`: the store factory, `readRows`, and the sync fragment and timeout settings.
  - `classify.ts`: Jev request and response mapping, and `CLASSIFY_THRESHOLD`.
  - `api.ts`: response schemas for `/api/ping` and `/api/sync-ticket`.
- `src/core/` is the client logic, with no React, DOM storage or Worker types:
  - `client.ts`: `createDumpClient(platform)`, which covers the notebook lifecycle, commands, snapshot and filing queue.
  - `connection.ts`: server URL validation, identity checks, tickets, storage names and error messages.
  - `server-link.ts`: one server over fetch and WebSocket. The browser and the Mac app share it.
  - `classify.ts`: the HTTP client for `/api/classify`.
- Platforms plug in through `ClientPlatform` in `client.ts`. The browser adapter is `src/client/browser-platform.ts`, the Mac adapter is `mac/engine/platform.ts` and the phone adapter is `mobile/src/platform.ts`. Persistence, tab sync and device events are adapter concerns. Keep this boundary, because a future Raycast client would plug in the same way.
- `src/core` also runs in the Mac's JavaScriptCore and the phone app's Hermes, so it may use only the APIs that `mac/engine/polyfills.ts` installs and `mobile/src/runtime.ts` provides. See [mac.md](mac.md#polyfills) and [mobile.md](mobile.md#runtime).

## Data model

- A dump is one atomic JSON cell in the `dumps` table. Its list, done flag and provenance (`classified_by`: `'user'`, `'ai'` or `null`) always change together.
- A list is also an atomic JSON record in the `lists` table, with a stable ID, a label, a color and a numeric `position`. Renaming keeps the ID. Nothing reorders lists yet.
- Removing a dump or list writes `deleted: true`, and that tombstone syncs like any other edit. Rows are never removed without a deliberate compaction design.
- Formats change in place. There are no schema versions or migrations while Dump is prerelease.
- `readRows` decodes every row with Zod and skips the ones that fail. It is the only way to read the store. → `tests/domain.test.ts` "skips rows a peer sent that do not decode"

## Merge and sync

- TinyBase's hybrid logical clocks resolve conflicts. The latest change wins for the whole dump, offline edits included, because the owner uses one device at a time. There is no manual precedence and no revision check. `updated_at` never competes with the merge clock. → `tests/domain.test.ts` "TinyBase merge contract"
- Merge metadata has to survive SQLite persistence, restarts and schema changes. → `tests/domain.test.ts` "restores merge metadata across server restarts"
- Sync uses `createWsSynchronizer` on the client and `WsServerDurableObject` on the server (`/api/sync`). Peers compare hashes and send only the rows that differ, and live edits reach every open device. Tabs sync with `createBroadcastChannelSynchronizer`. Large messages are split into fragments (`SYNC_FRAGMENT_BYTES`), so there is no snapshot size limit.
- Sync needs WebSockets; there is no HTTP fallback.
- Import is additive. It restores missing IDs and never rewinds existing records.

## Commands

The notebook changes only through the commands `createDumpClient` returns: `capture(raw, list)`, `setDone`, `file`, `remove`, `saveList`, `deleteList`, `clearDone`, `importDumps`, `backup`, `syncNow` and `reconnect`. The Mac engine wraps the same commands, and the phone app calls them directly.

- `capture` writes to the store synchronously and returns the dump. A `!list` prefix wins over the chosen `list`. A dump filed at capture gets `classified_by: 'user'`; an unfiled one is handed to `autoFile` on the next tick. → `tests/client.test.ts` "captures into the chosen list without asking Jev"
- `file` (including filing back to the inbox with `null`) records `classified_by: 'user'`, so Jev leaves that dump alone.
- `deleteList` tombstones the list and resets its dumps to `list: null, classified_by: null`, so `autoFile` sorts the open ones again. A dump moved to the inbox by hand stays there. → `tests/client.test.ts` "deleting a list sends its dumps back to Jev"
- `clearDone` tombstones every completed dump and returns the count.

## Filing queue and Jev

- Jev is on exactly when the server has `JEV_API_KEY`, which `/api/ping` reports as `classify`. Without the key, or with fewer than two lists, unfiled dumps stay in the inbox for the owner to sort.
- With Jev on, every dump ends up in a list. A `!list` prefix files it at capture. Otherwise `autoFile` asks Jev after capture, then files to Jev's pick (`classified_by: 'ai'`, confidence ≥ `CLASSIFY_THRESHOLD`) or to To do (`DEFAULT_LIST`). Cards show "Sorting…" in the meantime.
- Unfiled open dumps are the durable queue: failed requests and closed tabs are retried on the next load or reconnect, with at most three requests at a time. New captures go ahead of a backlog sweep.
- If the owner files, completes or removes a dump while Jev is still answering, the owner's change wins. → e2e `app.spec.ts` "filing by hand beats a late answer"
- Server-side AI work would need durable retry state; `waitUntil` alone is not enough.
- `CLASSIFY_THRESHOLD` is 0.4. Retune it against a labelled set of real dumps rather than guessing ([architecture.md § Why Jev](architecture.md#why-jev)).

## Connections and profiles

- `serverUrl` accepts only an HTTPS origin, or HTTP on localhost, with no path, credentials or query string. → `tests/connection.test.ts` "accepts HTTPS origins"
- Each notebook is a local profile `{ id, server }`, where `server` is `null` for a device-only notebook. Each profile has its own storage (`databaseName`: `dump-v1-<id>`) and tab channel (`channelName`). → `tests/connection.test.ts` "gives each notebook its own storage"
- Before syncing, a client validates `/api/ping`, pins the server's persistent `instanceId`, and sends it on the WebSocket upgrade, where the server checks it again. A different notebook at the same URL needs a new profile, and no data moves between profiles implicitly. → `tests/client.test.ts` "never uploads local data when identity validation fails"
- A device-only notebook never syncs or files, and its sync state is `local`. Connecting it to a server later merges its data into that server's notebook.
- A refused owner key puts sync in `signed-out`, with no retries, until `reconnect()` runs after a new key is verified. → `tests/client.test.ts` "a refused key signs out"
- Switching profiles flushes storage, stops sync, listeners, retries and AI, then reloads. A failed flush blocks the switch. Other tabs keep their old profile until they reload.
- Owner keys are stored outside the profile registry, by the platform: browser localStorage on the web, the Keychain on the Mac, and the Keychain or Android Keystore on a phone.

## Known risk: capture cost grows with the data

After every transaction, `readRows` decodes and sorts every dump (see `addDidFinishTransactionListener` in `client.ts`). The web App then repeats filters and counts, and search mounts every candidate. This is deferred until the data grows. When it does, measure capture latency first, then adopt TinyBase queries or indexes or memoized selectors, and virtualize long lists. Nothing yet calls for a database change.
