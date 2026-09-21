# Architecture review and first UI pass

Reviewed 21 September 2026. Scope: capture, layout, navigation, lists, board, settings, themes, marketing, and a Jev integration design. Authentication was explicitly deferred by Abishek; production remains public. No AI calls are enabled.

## Diagnosis

The local-first data foundation is appropriate for this personal app. Keep synchronous TinyBase capture, asynchronous IndexedDB persistence, atomic dump cells, and tombstones. (Sync has since moved to TinyBase's WebSocket synchronizer; see the owner decisions below.) The main weakness was that the UI and domain model encoded the first screen instead of supporting a workspace with several views.

| Concern | Underlying cause found | First-pass response |
| --- | --- | --- |
| Sidebar appears abruptly | Production changed its transform at a breakpoint without a transition. A conditional scrim and an ordinary aside provided no modal focus/scroll management. | Desktop navigation stays in the layout. Mobile uses shadcn's Radix Sheet with a left slide, modal focus handling, and 160ms motion. |
| Dialog placement feels wrong | Native dialogs shared visual styles but had no explicit centering; Tailwind's reset removed default margins. There was no shared overlay component. The code alone cannot establish that every overlay appeared at the top right. | Shared shadcn/Radix Dialog centers content, constrains height, restores focus, and owns dismissal. Item menus remain anchored to their buttons. |
| Cannot create a list | The schema was a five-value enum. The parser, UI descriptions, icons, triage shortcuts, and selects all depended on that enum. A new button alone could not create a valid synced category. | Lists are validated records with stable IDs, names, colors, and positions. Create/rename/reorder use the existing merge and persistence path. |
| No board or personal ordering | A single selected view filtered one array, always newest-first. There was no list-position field or board view. | Optional `/board`, independently ordered columns, drag handles through dnd-kit, and explicit Move left/right buttons. Card filing remains in its menu; dragging cards and manual card order are not implemented. |
| Search feels basic | Typing into a substring filter changed the global view to All. Keyboard shortcuts merely focused that input; there was no navigation/results interaction model. | shadcn Command/cmdk handles filtering and arrow-key selection. Search includes dumps, list names, tags, and navigation. Results link to a selected item. Semantic search is not implemented. |
| Dark mode is missing | Colors were literal values spread through CSS and Toast was fixed to light. | Semantic CSS variables provide a neutral-and-lime palette; next-themes owns Light/Dark/System preference and Sonner follows it. The preference is per device. |
| Mobile feels adapted, not designed | Desktop controls were compressed by media queries. Navigation had no focus management, cards depended on narrow controls, and overlays had no consistent size rules. | Mobile Sheet, icon search trigger, bounded dialogs, readable capture input, anchored card menus, and horizontally scrolling board columns. Real-phone keyboard/share testing remains outstanding. |
| Import/export are too prominent | Navigation, account help, operations, and daily capture all occupied the same surface. | Backup controls and appearance live in Settings; an emergency export remains visible on storage failure. |
| `/marketing` missing | The sole entry mounted the notebook on every URL, initializing local storage and networking. | React Router and lazy page modules separate `/marketing` from the notebook. Direct marketing visits do not initialize the notebook. The app footer uses a document navigation so an already running notebook is torn down. |

There was also **source/deployment drift**: local `styles.css` contained only the Tailwind import and responsive overrides, whereas the deployed CSS included the complete base theme. A clean build would have published a much less styled app. Type checks and the original interaction tests did not detect this. This pass rebuilds base styles and preserves the deployed lime badge (`#d8ee79`, dark asterisk, -5° rotation). Following Abishek's explicit visual correction, the final interface removes the purple tint: off-white (`#f7f7f5`), charcoal (`#30332b`), lime actions, and muted green selected states. Individual list colors remain small category accents. Screenshots and a logo-color assertion now accompany interaction checks.

## Structure after the first pass

- `src/client/main.tsx`: theme, router, lazy page loading, notifications, PWA registration.
- `src/client/App.tsx`: notebook shell and coordination of capture, navigation, and actions.
- `src/client/components`: cards, board, search, list editor, sorting, settings, and brand.
- `src/client/components/ui`: vendored shadcn registry components built on Radix; `cmdk` powers Command. These own keyboard, focus, layering, and dismissal behavior.
- `src/shared/schema.ts`: dump/list codecs and backup schema; `merge.ts` creates the store and decodes rows, skipping invalid ones.
- `src/client/store.ts`: local state, persistence, sync, and domain commands. This is still a larger module and should be split when adding jobs or more sync states, without moving networking into capture handlers.

UI components were fetched from the [official shadcn registry](https://ui.shadcn.com/docs/installation/manual). Board sorting uses [dnd-kit](https://dndkit.com/legacy/presets/sortable/overview/); theme preference uses [next-themes](https://github.com/pacocoursey/next-themes). `components.json` and the client alias support future component additions. Shared Dialog adds a return-focus hook for programmatically opened dialogs, and project CSS constrains motion to 160ms with reduced-motion overrides.

## Data migration and rollout

*Superseded: the app has not reached production, so version 1 input is no longer accepted and the rollout steps below no longer apply.*

Schema/transport/export version is now 2. The validator accepts version 1 input; backups without a lists array still import. Existing dump JSON and TinyBase clocks are not rewritten. Existing default list IDs (`ideas`, `buy`, `watch`, `decor`, `todo`) remain valid. Default list metadata is projected until changed; custom lists and edited defaults are persisted as atomic JSON cells in the new `lists` table. The IndexedDB database name stays `dump-v1` to retain the existing local store; that name is not the transport version.

Each move changes one list's numeric position between its neighbors. Ties converge with an ID tiebreaker. Concurrent offline arrangements can interleave; this is an eventual ordering, not a collaborative sequence CRDT. After very many midpoint moves, numeric precision could require an explicit reindex design. Lists are capped at 500. List deletion/archiving is intentionally absent from this first pass; existing tombstone semantics remain available in the schema.

An old cached client rejects a version 2 response and may show sync pending. **Reload updated clients after deployment**, including installed PWAs, using the update notice. Their version 1 input remains accepted so captured data can reach the server. Do not roll back to the old server after custom lists exist: its schema cannot understand those records. Prefer a forward fix. Additive import restores missing IDs and does not rewind existing records, so it is not a full disaster-recovery rollback mechanism.

## Remaining architectural issues, in priority order

**Owner decisions (21 September 2026):** Sync now uses TinyBase's built-in WebSocket synchronizer and `WsServerDurableObject`, replacing HTTP snapshots, polling, and the Agents SDK. Only differing rows travel, which resolves 4. The server no longer validates records; clients skip rows that fail decoding. There is no backwards compatibility before production. Undo is removed entirely; done, filing, and remove are final. The latest change wins, offline edits included, and no manual-precedence merge is planned. This is a single-user app used from one device at a time, so test depth (6) and backups (7) are out of scope for now. Live WebSocket sync stays. Items 1, 2, 4, 6, and 7 are closed by these decisions; 3 and 5 remain, with 3 deferred until the data grows.

1. **Closed: undo removed.** ~~Whole-record undo could restore unrelated fields.~~ Previously, undo restored list, done, deleted, and provenance regardless of the action being undone. This pass restores only the affected fields. It still does not provide revision-conditional undo for a later edit to the *same* field; define that policy before AI integration.
2. **Closed: latest change wins by decision.** ~~An AI provenance flag does not enforce manual precedence.~~ TinyBase chooses whole-cell winners by its own clocks, not by `classified_by`. A late AI write could win over a manual filing. A server revision check protects against changes it has already seen, but cannot protect against an offline manual edit it has not received. Automatic filing needs a stronger proposal/acceptance design.
3. **Capture work grows with the full dataset.** `rebuild()` decodes and sorts every dump after each transaction, synchronously. App then repeats filters/counts, and search mounts all candidate items. Splitting components alone does not fix this. Measure capture latency with realistic collections, adopt TinyBase queries/indexes or memoized selectors, then virtualize long result sets if needed. There is no evidence yet requiring a database replacement.
4. **Closed: replaced by TinyBase's incremental sync.** ~~Snapshots eventually hit a hard sync ceiling.~~ Each edit and each visible-tab poll serializes the complete store. Tombstones continue to count. There is a 4 MiB outgoing limit; import allows larger files, and the server can accumulate a combined store larger than any one incoming request. This can leave devices unable to upload after receiving a larger merged response. Add size visibility, meaningful import preflight, and a deliberate bounded/delta sync or compaction design. Never just delete tombstones.
5. **Sync and storage state are coupled in one global service.** Polling, WebSocket reconnection, tab broadcasts, persistence, and UI snapshots share module state. There is no explicit stop lifecycle, and storage-error state was sticky even after successful writes (fixed: a clean save now clears it). Introduce a tested start/stop lifecycle and distinct persistence/transport status when expanding the product. Marketing currently avoids initialization and uses a full navigation out of the notebook.
6. **Out of scope for now (single user).** Checks missed visual and operational regressions. Previous tests programmatically clicked an export control that could be offscreen. That bypassed the UX being tested. Tests now use visible Settings controls. Existing restart coverage serializes TinyBase state; it is not a physical SQLite restart/restore drill. Deployment previously omitted lint even though `check` included it; the deploy script now runs lint too.
7. **Out of scope for now (backups deferred).** Resilience is not backup. Multiple synced copies can converge on an unwanted change. Export is manual and import additive. Scheduled backups, restore drills, actual-phone testing, and durable AI retry jobs remain future work.

## Jev: good fit for choosing a home, not rewriting a thought

I read the supplied [introduction](https://typesafe.ai/blog/introducing-system-one-models-and-jev), the [official quickstart](https://docs.typesafe.ai/introduction/quickstart), [primitives](https://docs.typesafe.ai/primitives), and [confidence guidance](https://docs.typesafe.ai/confidence). Jev returns constrained decisions from supplied options. The useful primitive here is Choice: select an existing list or an explicit “leave in inbox” option. Noul can independently judge membership in known tags. It does not generate arbitrary new tag names or summarize/rewrite the original text. Constrained output shape does not guarantee that a filing decision is correct.

Proposed first integration:

1. Capture remains synchronous and entirely local. Classification only begins after the item has been durably synced.
2. In the existing SQLite-backed Durable Object, persist a classification job with dump ID, input revision/fingerprint, taxonomy revision, model/prompt version, attempt count, status, and next retry time. A durable alarm/scheduler resumes pending work; `waitUntil` is insufficient.
3. A server adapter calls `POST https://api.typesafe.ai/v1/systemone` using a Worker secret. Send only the relevant original text and list descriptions. Use stable list IDs as Choice keys and include a `leave_in_inbox` option. Bare URLs often lack enough meaning; keep them in the inbox until safe link context exists.
4. Validate the response with Zod and confirm its chosen ID still exists. Store a proposal and its probabilities separately from the original dump cell. Check revisions, tombstones, existing manual filing, and any previous rejection before surfacing it.
5. Start with suggestions in the sorting UI. Accepting one is a manual atomic filing action. Rejecting or undoing one persists a rejection keyed to the proposal/input revision, so retries do not reapply it. Keeping proposals separate also prevents a late AI write from competing with an unseen offline manual decision.
6. Evaluate on Abishek-labeled examples, especially ambiguous Buy/Decor, Ideas/To do, Nepali/English notes, URLs, and vague thoughts. Measure correctness, abstention, latency, retry behavior, and cost. Confidence describes the returned distribution; do not treat a value such as 0.9 as a proven 90% accuracy guarantee. Choose thresholds from observed results. Consider automatic filing only after the manual-precedence problem has a tested solution.

The hard part is durable jobs and decision ownership, not calling the model. No production data was sent to Jev and no API key or AI integration was configured in this pass.

## Follow-up design choices

The next refinement can focus on board density and choosing which lists appear, card movement/reordering, a mobile capture surface, search filters, and list descriptions for classification. Preserve the Inbox-first default and the established visual identity. Authentication is out of scope at the user's request; keep public deployment status explicit in product and operations documentation.
