# Dump

A capture-first notebook for one person's thoughts and links: capture right away, organize later if at all. The owner is Abi. Everyone uses one hosted web app at `dump.abishrestha.com.np`. Each user either deploys a private server (Abi's is `dump-api.abishrestha.com.np`) or keeps a notebook on one device only. It is one package with three separately built targets: the static web client, the API Worker, and a personal Mac app. Dump is prerelease, so formats change in place and there is no API or schema versioning.

## Rules

These apply everywhere. The arrows point to the tests that enforce them; each area doc lists its own rules.

- Capture updates the TinyBase store and the UI synchronously. Persistence, network requests and AI run after the capture handler returns. → `tests/client.test.ts` "updates memory synchronously"
- TinyBase owns merging: hybrid logical clocks, and the latest change wins for the whole dump, including offline edits. `updated_at` is display metadata only. Sync is TinyBase's own WebSocket synchronizer, with no custom protocol on top. → `tests/domain.test.ts` "TinyBase merge contract"
- Each dump is one atomic JSON cell. Removing a dump writes a `deleted` tombstone; rows are never physically removed. There is no undo.
- Every reader decodes rows through `readRows` (`src/shared/merge.ts`) and skips rows that fail validation. The server relays rows without reading them. → `tests/domain.test.ts` "skips rows a peer sent"
- Dumps change only through the core's commands (`capture`, `setDone`, `file`, `remove`, `saveList`, `deleteList`, `clearDone`). These keep `classified_by` consistent with the filing queue. → `tests/client.test.ts` "dump and list actions"
- AI may file a dump, but never deletes it or rewrites its text.
- Each server has one owner key. There are no accounts, sessions, cookies, multi-tenancy, D1, Postgres or application KV. Per-device tokens are deliberately not built. → `tests/auth.test.ts`
- `src/core` runs both in browsers and in the Mac app's JavaScriptCore, so it may use only the web APIs that `mac/engine/polyfills.ts` installs. → `mac/Tests/DumpKitTests`

## Docs map

Each fact has one owning doc. Read the owning doc before changing its paths.

| Area | Paths | Owning doc |
| --- | --- | --- |
| Data model, merge, sync, commands, filing and Jev queue, connections | `src/shared/`, `src/core/` | [docs/core.md](docs/core.md) |
| API Worker: owner key, origins, Jev proxy, Durable Object | `src/server/`, `wrangler.jsonc` | [docs/server.md](docs/server.md) |
| Web UI: views, look, phone keyboard, loading screen, first run, CSP | `src/client/`, `index.html`, `public/`, `wrangler.client.jsonc` | [docs/web-client.md](docs/web-client.md) |
| Mac app: engine, polyfills, Swift shell, build, checks | `mac/` | [docs/mac.md](docs/mac.md) |
| Unit and e2e test setup, debugging failures | `tests/`, `playwright.config.ts` | [docs/testing.md](docs/testing.md) |
| Deploy, versions, tags, GitHub releases | `run.tasks` in `vite.config.ts`, `mac/Info.plist` | [docs/release.md](docs/release.md) |
| How it fits together: diagrams, code map, decisions, why Jev | | [docs/architecture.md](docs/architecture.md) |
| Usage, Mac install, deploy guide, security summary, limitations | for humans | [README.md](README.md) |
| Rules a reviewer enforces on a diff | | [CODING_STANDARDS.md](CODING_STANDARDS.md) |

## Keeping docs true

- Make each doc update in the same change as the code. If a change alters a rule, command, gotcha or behavior that an owning doc describes, update that doc. If it changes what a user sees, how setup works or how deploys work, update README. If it adds, removes or renames a file under `src/` or `mac/`, update the code map in `docs/architecture.md`.
- State each fact once, in its owning doc. Anywhere else, link to it.
- A new rule needs a test, and the doc line names that test. If no test can check the rule, the line says so.
- When something stops being true, delete it. Docs describe the present; history belongs in git.

## Commands

`package.json` lists the scripts. These are the gotchas around them:

- `npm run check` runs the format check, lint, unit tests, type checks (client, Worker and Mac engine) and both builds. It does not build Swift.
- Mac changes: run `npm run mac:engine && (cd mac && swift build && swift test)`. `swift test` builds only `DumpKit`, and the app embeds `mac/build/engine.js`, so rebuild the engine first.
- `npm run dev` serves the web client on 6191 and the API on 6190. The dev owner key, `dump-local-development-owner-key`, is prefilled in the connect form. Abi usually has dev running: if `preview_start` reports 6191 is busy, open http://localhost:6191 directly. That notebook is Abi's local data, so remove any dumps you add while testing.
- Deploy, push, tag, release or run `mac:install` only when Abi asks; see [docs/release.md](docs/release.md).
- The toolchain is Vite+ (CLI `vp`). All Vite, Vitest, Oxlint and Oxfmt config lives in `vite.config.ts`, tests import from `vite-plus/test`, and `vite` resolves to `@voidzero-dev/vite-plus-core` through `overrides` in `package.json`. Oxfmt skips Markdown. Vite+ docs are in `node_modules/vite-plus/docs/` (`guide/`, `config/`).
- TinyBase's API reference is the JSDoc, with examples, in `node_modules/tinybase/@types/<module>/index.d.ts`. There is an overview at https://tinybase.org/llms.txt.
