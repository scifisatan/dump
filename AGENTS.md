# Dump

A capture-first notebook for one person's thoughts and links: capture right away, organize later if at all. The owner is Abi. Everyone uses one hosted web app at `dump.abishrestha.com.np`. Each user either deploys a private server (Abi's is `dump-api.abishrestha.com.np`) or keeps a notebook on one device only. It is one repository with four separately built targets: the static web client, the API Worker, a personal Mac app, and a phone app for iOS and Android (`mobile/`, its own npm package). Dump is prerelease, so formats change in place and there is no API or schema versioning.

The code is a stack: contracts (`src/shared/`), then the core (`src/core/`), which every client runs, then each client's platform adapter and the surface it draws. The server stands beside the stack and relays rows without reading them. Put behavior in the lowest layer that can own it. [architecture.md § Code layers and seams](docs/architecture.md#code-layers-and-seams) shows where a change reaches other targets, and [§ Words](docs/architecture.md#words) maps the product's words to the code's names (a list is a `Collection`).

## Tools

- **`npm run verify`** after every change. It reads the diff, runs the checks for every target the change reaches (format, lint, unit and docs tests, each typecheck, builds, Swift, the phone's typecheck) in parallel, and prints one line per check, the end of any failure's output, and a `·` line for each thing it couldn't check. `--base main` checks the whole branch, `--all` everything, `--e2e` adds Playwright.
- **`node cli/dump.mjs`** is the notebook's core on Node: a device you drive from the shell, through the same commands and views as every client. Reproduce and check notebook behavior here before reaching for a UI. Devices are folders under `.dump/devices/` (`-d NAME`), `--now` moves the clock to test days, `--json` prints whole dumps, and `peek FILE` reads a notebook file such as the Mac app's. `--help` lists the commands.
- **`npm run scratch`** starts a server you can break on 6195, empty at every start. Run it in the background, then `node cli/dump.mjs -d a connect scratch`. The Mac's `dump-check` and the phone simulator can join it too.
- **`npm run dev`** serves the web client on 6191 and the API on 6190, with the owner key `dump-local-development-owner-key` prefilled. Abi usually has it running: if `preview_start` reports 6191 is busy, open http://localhost:6191 directly. That notebook is Abi's local data, so remove any dumps you add.

Two devices syncing, with Friday's dump checked from Saturday:

```bash
node cli/dump.mjs -d a connect scratch && node cli/dump.mjs -d b connect scratch
node cli/dump.mjs -d a capture "pay rent by friday"
node cli/dump.mjs -d b --now 2026-11-14T09:00 home    # Today · … · 1 overdue
```

## Rules

These apply everywhere. The arrows point to what enforces them; each area doc lists its own rules.

- Capture updates the TinyBase store and the UI synchronously. Persistence, network requests and AI run after the capture handler returns. → `tests/client.test.ts` "updates memory synchronously"
- TinyBase owns merging: hybrid logical clocks, and the latest change wins for the whole dump, including offline edits. `updated_at` is display metadata only. Sync is TinyBase's own WebSocket synchronizer, with no custom protocol on top. → `tests/domain.test.ts` "TinyBase merge contract"
- Each dump is one atomic JSON cell. Removing a dump writes a `deleted` tombstone; rows are never physically removed. There is no undo. → `tests/domain.test.ts` "keeps filing atomic", "keeps a deletion tombstone"
- Every reader decodes rows through `readRows` (`src/shared/merge.ts`) and skips rows that fail validation. The server relays rows without reading them. → `tests/domain.test.ts` "skips rows a peer sent"
- Dumps change only through the core's commands (`capture`, `setDone`, `setDue`, `file`, `remove`, `saveList`, `deleteList`, `clearDone`). These keep `classified_by` consistent with the filing queue. → `tests/client.test.ts` "dump and list actions"
- AI may file a dump, but never deletes it or rewrites its text. → no test: Jev's answer holds only a list ID and a confidence (`classifyResultSchema`), so it has nothing to write with.
- Each server has one owner key. There are no accounts, login sessions, cookies, multi-tenancy, D1, Postgres or application KV. Per-device tokens are deliberately not built. → `tests/auth.test.ts`
- `src/core` and `src/shared` import no React, Node, Worker or client code, and use only the web APIs that `mac/engine/polyfills.ts` installs and `mobile/src/runtime.ts` provides. → lint (`overrides` in `vite.config.ts`) for imports and browser globals, and `mac/Tests/DumpKitTests` for JavaScriptCore. → no test: Hermes is checked by hand ([docs/mobile.md § Runtime](docs/mobile.md#runtime)).

## Docs map

Each fact has one owning doc. Read the owning doc before changing its paths.

| Area | Paths | Owning doc |
| --- | --- | --- |
| Data model, merge, sync, commands, views, filing and Jev queue, connections | `src/shared/`, `src/core/` | [docs/core.md](docs/core.md) |
| API Worker: owner key, origins, Jev proxy, Durable Object, local servers | `src/server/`, `wrangler.jsonc` | [docs/server.md](docs/server.md) |
| Web UI: views, look, phone keyboard, loading screen, first run, CSP | `src/client/`, `index.html`, `public/`, `wrangler.client.jsonc` | [docs/web-client.md](docs/web-client.md) |
| Mac app: engine, polyfills, Swift shell, build, checks | `mac/` | [docs/mac.md](docs/mac.md) |
| Phone app: Expo setup, runtime shims, screens, iOS and Android builds | `mobile/` | [docs/mobile.md](docs/mobile.md) |
| The dump CLI, `verify`, and the unit, seam, docs and e2e tests | `cli/`, `scripts/`, `tests/`, `playwright.config.ts` | [docs/testing.md](docs/testing.md) |
| Deploy, versions, tags, GitHub releases | `run.tasks` in `vite.config.ts`, `mac/Info.plist`, the version in `mobile/package.json` | [docs/release.md](docs/release.md) |
| How it fits together: layers and seams, words, diagrams, code map, decisions, why Jev | | [docs/architecture.md](docs/architecture.md) |
| Usage, Mac install, deploy guide, security summary, limitations | for humans | [README.md](README.md) |
| Rules a reviewer enforces on a diff | | [CODING_STANDARDS.md](CODING_STANDARDS.md) |

## Keeping docs true

- Make each doc update in the same change as the code. If a change alters a rule, command, gotcha or behavior that an owning doc describes, update that doc. If it changes what a user sees, how setup works or how deploys work, update README. If it adds, removes or renames a source file, update the code map in `docs/architecture.md`.
- State each fact once, in its owning doc. Anywhere else, link to it.
- A new rule needs something that enforces it. End the rule's line with `→` and the test, written as `` `tests/client.test.ts` "a refused key signs out" ``, e2e `` `app.spec.ts` "Today shows what is overdue" `` or `` `EngineTests.swift` `textEncoderMatchesUTF8` ``. When nothing can, end it with `→ no test:`, why, and how it was checked by hand.
- When something stops being true, delete it. Docs describe the present; history belongs in git.
- `tests/docs.test.ts` fails when a doc names a test, link, heading or code path that doesn't exist, or when the code map misses a source file. The rest is the reviewer's ([CODING_STANDARDS.md § Docs stay true](CODING_STANDARDS.md#docs-stay-true)).

## Gotchas

- `npm run check` is what deploys run: format, lint, unit tests, the web, Worker, Mac engine, CLI and test typechecks, and both builds. It doesn't build Swift or typecheck `mobile/`; `verify` does when the change reaches them.
- Deploy, push, tag, release or run `mac:install` only when Abi asks; see [docs/release.md](docs/release.md).
- The toolchain is Vite+ (CLI `vp`). All Vite, Vitest, Oxlint and Oxfmt config lives in `vite.config.ts`, tests import from `vite-plus/test`, and `vite` resolves to `@voidzero-dev/vite-plus-core` through `overrides` in `package.json`. A `run.tasks` name can't match a `package.json` script. Oxfmt skips Markdown. Vite+ docs are in `node_modules/vite-plus/docs/` (`guide/`, `config/`).
- TinyBase's API reference is the JSDoc, with examples, in `node_modules/tinybase/@types/<module>/index.d.ts`. There is an overview at https://tinybase.org/llms.txt.

<!-- ASTRYX:START -->
Astryx v0.7.11 · 174 components
CLI: run every command as `npx astryx <cmd>` (shown below as `astryx ...`).

SETUP (once, in app entry e.g. main.tsx) — without these, components render unstyled:
  import "@astryxdesign/core/reset.css";
  import "@astryxdesign/core/astryx.css";

WORKFLOW — start every page from a template, never from scratch:
1. `astryx build "<idea>"` — names the template to scaffold from and the parts it lacks.
2. `astryx template <name> <path>` — scaffold it; keep its frame, gap and padding; replace the content.
3. `astryx template <Block>` for parts it lacks; `astryx component <Name>` to read props before using one.
Changing an existing page? Keep it: skip step 2 and add blocks/components inside its sections.
Before you deliver a build, run `astryx doctor --built <dir>`; don't deliver it if it fails.

RULES:
- No <div> — components handle all layout and spacing.
- Read `astryx docs layout` before changing a template's frame.
- Dense data = rows (Table, List/Item), not Card-wrapped lists. Badge = counts only.
- Style with component props first, then Tailwind utilities backed by tokens. No raw hex/px.
- Palettes and custom colors go through the theme, never :root overrides. Run `astryx theme add <slug>` to import; `theme eject <slug>` only forks source. See `astryx docs theme`.
- SELF-CHECK: re-read the file; replace any style={{…}}, raw <div>/<span>, imported .css/@apply, or hardcoded/arbitrary value (bg-[#fff], p-[13px]) with the component or a token-backed utility.

`astryx help` lists every command. Key ones beyond the workflow:
  search "<query>"   find any component / hook / doc / template
  discover <words>   integrations you could add
  docs <topic>       getting-started, principles, tokens, theme … (`astryx docs` lists all)
  docs cli           commands and API reference
  docs authoring     build an integration package, and every field it holds
  upgrade --from <old version> --apply   run after a dependency bump
<!-- ASTRYX:END -->
