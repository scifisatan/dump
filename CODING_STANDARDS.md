# Coding standards

These are the rules a reviewer applies to a diff. Every rule applies to every diff, and each violation is a finding. Product rules and their tests are in [AGENTS.md](AGENTS.md#rules); the area docs it maps hold rules specific to each area.

## Types and boundaries

These are the anti-slop principles from dmmulroy/anti-slop. They are vendored and maintained here, not pulled in as a dependency.

- Parse data where it crosses a boundary (network, storage, user input, the JavaScriptCore bridge) explicitly, with Zod. Inside the boundary, use the parsed types.
- Keep known values typed. Don't widen a value to `unknown` and then assert it back.
- Don't use unchecked dictionary contracts (`Record<string, T>` read as if every key existed). Use `Map`, a schema, or an explicit lookup that handles a missing key.
- A non-`const` type assertion needs a nearby `// SAFETY:` comment saying why it holds.

## Layers

- `src/core` and `src/shared` import no React and no Worker types, and use only the web APIs that `mac/engine/polyfills.ts` installs and `mobile/src/runtime.ts` provides. That rules out `window`, `document`, `localStorage`, `indexedDB` and `navigator`. Because `mac/engine/tsconfig.json` includes the DOM types, the type checker won't catch this, so the reviewer has to.
- Browser code imports `src/shared`, never anything under `src/server/`.
- Only the command functions in `src/core/client.ts` write dumps or lists. A store write anywhere else is a finding.
- Swift calls the engine (`mac/engine/index.ts`) for notebook behavior. Notebook logic reimplemented in Swift is a finding.
- The phone app calls the core's commands. Notebook logic reimplemented under `mobile/` is a finding.

## Tests

- Test through public interfaces, with fakes passed in (for example `platform()` in `tests/client.test.ts`). Don't use module mocks (`vi.mock`).
- A bug fix comes with a test that fails without the fix.

## React and motion

- Any new React Doctor warning in the `vp lint` output is a finding. These rules are set to `warn`, so `npm run check` still passes when they fire. They cover effect cleanup, derived state in effects, event-handler effects, array-index keys and fetching in effects.
- Animate opacity and transform at 120–180ms, and honor `prefers-reduced-motion`. Every gesture needs a button that does the same thing. The documented exceptions are in [docs/web-client.md](docs/web-client.md).

## Docs stay true

These match "Keeping docs true" in AGENTS.md.

- For each changed path, find the row in AGENTS.md's docs map that owns it. If the diff changes a rule, command, gotcha or behavior that the owning doc (or README) describes, and that doc isn't updated in the same diff, it's a finding.
- A doc line the diff makes false is a finding, wherever it is.
- A file under `src/`, `mac/` or `mobile/` that is added, removed or renamed without a matching update to the code map in `docs/architecture.md` is a finding.
- A fact restated in a second file, instead of linked to its owning doc, is a finding.
- A new rule in a doc needs a test named next to it, or a note that no test can check it.
- History words in docs ("now", "former", "first pass", "no longer") are a finding: the line should state the present.
