# Checking a change

Owns `cli/` (the dump CLI), `scripts/verify.mjs`, `tests/` and `playwright.config.ts`. The Swift tests are covered in [mac.md](mac.md#build-and-check).

## verify

- `npm run verify` decides what to check from the changed paths: `git diff` against `HEAD` (or the merge base with `--base`) plus untracked files. The `reach` table at the top of `scripts/verify.mjs` maps paths to targets, as [architecture.md § Code layers and seams](architecture.md#code-layers-and-seams) describes them: `src/shared/` reaches every target, `src/core/` every client, and a root config file or anything under `scripts/` reaches everything.
- Format checks only the project's files that changed, so an editor folder such as `.vscode/` is never checked. Lint, the unit tests (with the docs and seam tests) and the test typecheck run for any code change. Each target adds its typecheck and build; the Mac adds `npm run mac:engine` then `swift build` and `swift test`; the phone adds its typecheck.
- At most four checks run at once. A failure prints its last 40 lines. A `·` line names what the run couldn't see: e2e (only with `--e2e`), the Swift UI, the phone's screens and Hermes.
- When a check or target is added, add it to `scripts/verify.mjs` in the same change, or `verify` stops covering it.

## The dump CLI

- `node cli/dump.mjs` bundles `cli/index.ts` with the core (rolldown, like the Mac engine) into `node_modules/.cache/dump-cli/` and runs it. Each run opens one device's notebook, waits for sync and for Jev to file new dumps (`--wait`, 15 seconds), runs one command, waits until the store has been quiet for 300ms so the server has every change, saves and exits. It prints sync problems on stderr and exits 1 on an error, 2 on a usage mistake.
- `cli/platform.ts` is a fourth `ClientPlatform`: a device is a folder holding each notebook as TinyBase JSON (the Mac app's format), `settings.json` (the registry and web app origin) and `keys.json` (owner keys in plain text). Like the Mac and phone apps, it presents a web app origin on `/api/` requests (`src/core/origin.ts`). `cli/render.ts` turns the core's views into one line per dump: a short ID, `○` open, `●` done, `…` sorting, `✕` removed, the text, then the list, `· Jev` when Jev filed it, the day and the tags.
- The CLI calls only the core's commands and views. Behavior it needs goes in `src/core`, like any client's.
- `connect scratch` reads the owner key from `tests/e2e/server.env`; `connect dev` uses the dev key, which writes to Abi's local data.
- `--now` shifts this run's clock, captures included, so a dump captured "by friday" at one `--now` can be checked from another. Days follow the shell's time zone (`TZ`).
- `node cli/dump.mjs forget` deletes a device's folder; `rm -rf .dump` deletes them all.

## Unit tests

- `npm test` runs Vitest through Vite+ (`vp test`). Tests import from `vite-plus/test`. The PWA plugin is skipped when `VITEST` is set, because unit tests are plain Node code.
  - `tests/domain.test.ts`: the capture parser, synced lists, and the TinyBase merge contract.
  - `tests/client.test.ts`: the client lifecycle and isolation, saving, and dump and list actions. These go through `createDumpClient` with an in-memory fake platform (`platform()` at the top of the file).
  - `tests/connection.test.ts`: server URLs, finding a server, storage names, the notebook registry, origins and error messages.
  - `tests/auth.test.ts`: owner keys and sync tickets.
  - `tests/classify.test.ts`: Jev request and response mapping.
  - `tests/views.test.ts`: the views every client shows (`src/core/views.ts`): Today's sections and summary, Sort inbox, attention, search and labels, plus the phone's inverted rows (`mobile/src/views.ts`).
  - `tests/seams.test.ts`: the names Swift and the Mac engine use for each other's functions, which no compiler checks: engine methods, native functions and host callbacks, compared in both directions.
  - `tests/docs.test.ts`: the docs themselves. Every test a doc names exists, every link and heading resolves, every code path a doc names exists (an area doc may name paths from its own folder), and the code map in `architecture.md` names every source file or a folder it describes as a whole.
- `tests/tsconfig.json` typechecks the tests, so a fake such as `platform()` breaks when `ClientPlatform` changes.
- Test through public interfaces with fakes passed in. See [CODING_STANDARDS.md](../CODING_STANDARDS.md) for the no-module-mocks rule.

## End-to-end tests

- Run `npm run test:e2e`, or `npm run verify -- --e2e`. Install the browser once first with `npx playwright install chromium`.
- Playwright starts three servers, and none of them may already be running:
  - Two API servers on 6192 and 6193 (`wrangler dev`), with isolated `.wrangler/test-state` and `.wrangler/test-state-peer` storage. Both load only `tests/e2e/server.env`, whose owner key matches `OWNER_KEY` in `tests/e2e/servers.ts` and which has no Jev key.
  - The built client on 6194, served by `wrangler dev --config wrangler.client.jsonc` so that `public/_headers` (the CSP) applies.
- The `setup` project (`connect.setup.ts`) onboards once and saves the session to `test-results/connected.json`. The other tests reuse that saved notebook. The connection tests start as new visitors.
- E2e servers never call Jev. Tests that need filing stand in for `/api/classify` with `fakeJev` in `app.spec.ts`.
- Shared helpers (`capture`, `connectServer`, `startOnboarding`) are in `tests/e2e/servers.ts`.

## When a test fails

- `test-results/<test-name>/error-context.md` holds the page's accessibility snapshot at the failure. Grep it for roles and text rather than reading the whole file.
- Each run clears `test-results/`, so a run of a single test deletes screenshots from earlier full runs.
