# Mac app

Owns `mac/`. For how a user installs and uses the app, read README § Mac app. This is a personal build: it is not notarized or distributed, because there is no paid Apple Developer account.

## Layout

- `mac/engine/` bundles `src/core`, `src/shared` and TinyBase into `mac/build/engine.js` (`build.mjs`). The bundle is a classic script, with no modules and no DOM.
  - `index.ts` is the engine API that Swift calls. Its methods wrap the core's commands: `snapshot(full)`, `listFor`, `capture(text, list)`, `setDone`, `file`, `remove`, `saveList`, `deleteList`, `clearDone`, `reconnect`, `network`, `resume`, `suspend`.
  - `platform.ts` is the Mac `ClientPlatform`.
  - `native.ts` is the bridge to Swift.
  - `polyfills.ts` supplies the web APIs that JavaScriptCore lacks.
- `Sources/DumpKit/` runs the engine in JavaScriptCore and supplies the platform natively: timers, randomness, HTTP (`HTTPBridge.swift`), WebSockets (`SocketBridge.swift`), notebook files, network state and the Keychain. It also holds the profiles (`Profiles.swift`).
- `Sources/Dump/` is the AppKit and SwiftUI shell: the hotkey (`HotKey.swift`), capture panel (`Capture*.swift`), notebook window (`Notebook*.swift`), settings (`SettingsView.swift`) and menu bar (`AppDelegate.swift`). App state lives in `AppModel.swift`.
- `Sources/dump-check/` is a headless sync check against a running server.
- `scripts/build-app.sh` builds, signs and installs the app (`--install`). `scripts/render-icon.swift` draws the icon.
- The app runs the web app's own core, so capture, `!list` filing, Jev, profiles and sync behave as they do on the web. When the Mac needs new behavior, add it to the core and expose it through `index.ts`. Swift should only call the engine, never reimplement notebook logic.

## Polyfills

- `src/core` may use only what `polyfills.ts` provides: the `install(...)` calls plus the core-js imports at the top of the file. When the core needs more, add a polyfill there.
- `fetch` supports what the core uses: string bodies, and no caching, cookies or redirects.
- `TextEncoder` must match browsers byte for byte, because TinyBase hashes its output. → `EngineTests.swift` `textEncoderMatchesUTF8`

## Behavior and storage

- **Origin:** as a non-browser client, the app sends an allowed `Origin`. That is the hosted app's origin, or the dev client's (`http://localhost:6191`) when the server is on localhost. Settings → Advanced can override it (`webAppOrigin`).
- **Storage:** notebooks are TinyBase mergeable JSON in `~/Library/Application Support/Dump/Notebooks/<profile-id>.json`, written atomically. The registry and settings live in UserDefaults (domain `np.com.abishrestha.dump.mac`, keys `connections`, `shortcut`, `webAppOrigin`). Owner keys live in the Keychain. Connecting, switching and signing in follow the web app's rules ([core.md](core.md#connections-and-profiles)).
- **Hotkey:** the global hotkey (default ⇧⌘Space) uses Carbon `RegisterEventHotKey`, which needs no Accessibility permission.
- **Notebook window:** it does what the web app does, all through engine commands. Its composer files into the list being viewed, and a `!list` prefix still wins. Snapshots carry every dump only while the window is open (`snapshot(full)`), which keeps the panel's cost per change small.
- **Activation:** the app is an accessory (menu bar only) until the notebook or Settings window opens. It then becomes a regular app with a Dock icon and a main menu, and switches back when those windows close. The main menu also supplies the Edit shortcuts that text fields need.
- **Capture panel keys:** the panel swallows ⌘Q, ⌘H and ⌘M, so they never act on an app the user can't see. ⌘W closes it and ⌘O opens the notebook.
- **Quitting:** SIGTERM quits through the normal save path, and `mac:install` relies on this. Start termination from the run loop, never from inside a main-queue block, because saving needs the main queue.
- **Rebuilding:** the bundle embeds `src/core`, so rebuild the app whenever the core or the API contract changes.

## Build and check

- After any change under `mac/`, `src/core` or `src/shared`: `npm run mac:engine && (cd mac && swift build && swift test)`. `swift test` builds only `DumpKit` and its tests; `swift build` compiles the `Dump` app target. `npm run typecheck` also typechecks `mac/engine`.
- `npm run mac:build` builds `mac/build/Dump.app`. `npm run mac:install` also signs it, replaces `/Applications/Dump.app` and relaunches it; run that only when asked. Signing uses `DUMP_SIGN_IDENTITY` from `mac/.env.local` (not committed), falling back to ad hoc signing. A stable identity keeps Keychain access across rebuilds.
- To check sync against a real server, start a scratch server ([server.md § Local servers](server.md#local-servers)), then run `cd mac && swift run dump-check --server http://localhost:6195 --key <key from tests/e2e/server.env> --origin http://localhost:6194 --data <dir> --capture TEXT`. Run it again with a second `--data <dir>` and `--expect TEXT` to confirm the dump reached another device. Other flags: `--profile`, `--list`.
- Logs from the running app: `/usr/bin/log show --last 1m --predicate 'process == "Dump"' --style compact`.

## Seeing the UI

Claude has no Screen Recording permission, so `screencapture` fails. To check a view, render it offscreen:
1. Add a temporary test target that builds an `AppModel` on a scratch data directory with sample dumps.
2. Host the view in an `NSHostingView` inside an `NSWindow`, and write PNGs with `bitmapImageRepForCachingDisplay` and `cacheDisplay`.
3. Run it with `swift test --filter`, look at the images, then delete the target.
