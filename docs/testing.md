# Tests

Owns `tests/` and `playwright.config.ts`. The Mac tests are covered in [mac.md](mac.md#build-and-check).

## Unit tests

- `npm test` runs Vitest through Vite+ (`vp test`). Tests import from `vite-plus/test`. The PWA plugin is skipped when `VITEST` is set, because unit tests are plain Node code.
  - `tests/domain.test.ts`: the capture parser, synced lists, and the TinyBase merge contract.
  - `tests/client.test.ts`: the client lifecycle and isolation, saving, and dump and list actions. These go through `createDumpClient` with an in-memory fake platform (`platform()` at the top of the file).
  - `tests/connection.test.ts`: server URLs, the ping shape, identity pinning, storage names, origins and error messages.
  - `tests/auth.test.ts`: owner keys and sync tickets.
  - `tests/classify.test.ts`: Jev request and response mapping.
  - `tests/mobile-views.test.ts`: the phone app's view helpers (`mobile/src/views.ts`): day rows for its inverted list, and search.
- Test through public interfaces with fakes passed in. See [CODING_STANDARDS.md](../CODING_STANDARDS.md) for the no-module-mocks rule.

## End-to-end tests

- Run `npm run test:e2e`. Install the browser once first with `npx playwright install chromium`.
- Playwright starts three servers, and none of them may already be running:
  - Two API servers on 6192 and 6193 (`wrangler dev`), with isolated `.wrangler/test-state` and `.wrangler/test-state-peer` storage. Both load only `tests/e2e/server.env`, whose owner key matches `OWNER_KEY` in `tests/e2e/servers.ts` and which has no Jev key.
  - The built client on 6194, served by `wrangler dev --config wrangler.client.jsonc` so that `public/_headers` (the CSP) applies.
- The `setup` project (`connect.setup.ts`) onboards once and saves the session to `test-results/connected.json`. The other tests reuse that saved notebook. The connection tests start as new visitors.
- E2e servers never call Jev. Tests that need filing stand in for `/api/classify` with `fakeJev` in `app.spec.ts`.
- Shared helpers (`capture`, `connectServer`, `startOnboarding`) are in `tests/e2e/servers.ts`.

## When a test fails

- `test-results/<test-name>/error-context.md` holds the page's accessibility snapshot at the failure. Grep it for roles and text rather than reading the whole file.
- Each run clears `test-results/`, so a run of a single test deletes screenshots from earlier full runs.
