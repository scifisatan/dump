# Phone app

Owns `mobile/`. For how a user installs and uses the app, read README § Phone app. It is an Expo (React Native) app for iOS and Android, a personal build that isn't in the App Store or Play Store.

## Layout

- `mobile/` is its own npm package (Expo SDK 57, React Native, Hermes). Its `.npmrc` sets `legacy-peer-deps`, because TinyBase lists optional peers (its React UI module, other databases) that ask for a newer React than React Native pins.
- `index.ts` loads `src/runtime.ts` first, then the app.
- `src/runtime.ts` supplies the web APIs Hermes lacks (see [Runtime](#runtime)) and the Origin header.
- `src/origin.ts` is the web app origin the app presents to servers, and its override (Settings → Web app address).
- `src/platform.ts` is the phone `ClientPlatform`: one expo-sqlite database per notebook (`dump-v1-<profile-id>.db`, TinyBase JSON in the `notebook` table), AppState and expo-network events, and no tabs.
- `src/profiles.ts` keeps the profile registry in expo-sqlite's key-value store (`dump-connections`) and owner keys in expo-secure-store (Keychain on iOS, Keystore on Android).
- `src/notebook.ts` is the open notebook: launching, switching, connecting and signing in, following the rules in [core.md](core.md#connections-and-profiles).
- `src/views.ts` holds the screens' pure helpers: which dumps a view shows, day rows for the inverted list, search, labels. → `tests/mobile-views.test.ts`
- `src/App.tsx` (native stack navigation), `src/screens/`, `src/DumpRow.tsx`, `src/Composer.tsx`, `src/menu.tsx`, `src/ui.tsx` and `src/theme.ts` are the UI.
- `metro.config.js` watches `../src` and resolves packages from `mobile/node_modules`, so TinyBase and Zod load once even for files under `../src`. `tsconfig.json` maps them to the same copies for types.
- `ios/`, `android/` and `dist/` are generated and not committed. Configure native settings in `app.json`; `npx expo prebuild` regenerates the native projects.
- The app calls the core's commands directly. Notebook behavior goes in `src/core`, never under `mobile/`.

## Runtime

- `src/core` runs here in Hermes. Hermes and React Native provide timers, `fetch`, `WebSocket` and `TextEncoder`; `src/runtime.ts` adds `crypto` (from expo-crypto), `structuredClone`, `URL`, `URLSearchParams` and `DOMException` (from core-js), and abort reasons, `throwIfAborted`, `AbortSignal.timeout` and `AbortSignal.any`. When the core needs another web API, add it here and in `mac/engine/polyfills.ts`. No automated test runs Hermes.
- Hermes's `TextEncoder` matches browsers byte for byte, lone surrogates included (U+FFFD), which TinyBase's hashes need. This was checked by hand in the simulator; no test can check it.
- Servers refuse requests without an allowed `Origin`. `src/runtime.ts` wraps `fetch` and `WebSocket` so that requests whose path starts with `/api/` present the web app origin, as the Mac app does natively: the override, else `http://localhost:6191` for a localhost server, else the hosted app. Other requests, such as Metro's in development, are left alone. No test can check this; Settings shows a refused origin's 403.

## Behavior

- The first launch opens a notebook on this phone right away, as the Mac does, and Settings greets the owner.
- The app opens on the inbox. Home, one step back, lists the inbox, lists and Done with counts, search across everything, and the sync status.
- Each view is a list grouped by day with the newest at the bottom, and a composer pinned above the keyboard. Return adds a line; the send button saves and keeps the keyboard up. A list view captures into its list, and a `!list` prefix wins. Done has no composer.
- Rows: the circle marks done. A long press opens every action (open link, done, move, copy, remove). Swiping right marks done; swiping left reveals Remove, which needs a tap because there is no undo.
- Native menus come from `@react-native-menu/menu`. Expo Go doesn't include it, so there `src/menu.tsx` opens the same actions in an action sheet.
- The web app address in Settings applies as it is typed, so a server checked next already sees it.
- Going to the background saves the notebook. Sync resumes when the app returns to the foreground or the network comes back.

## Build and check

- `cd mobile && npm install`, then `npm run typecheck`. The root `npm run check` formats and lints `mobile/` but doesn't typecheck or build it.
- iOS simulator: `npm run ios` (prebuild, CocoaPods, Xcode build, launch, Metro). CocoaPods needs `LANG=en_US.UTF-8`.
- Expo Go on a phone: `npx expo start --go` in `mobile/`, then scan the QR code. The phone must reach this Mac over the network.
- Android APK: `npx expo prebuild -p android`, then `./gradlew assembleRelease` in `mobile/android/` with `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"` and `ANDROID_HOME=~/Library/Android/sdk`. Gradle downloads the NDK and CMake on the first build. Release builds embed the JS bundle and are signed with the debug keystore that `expo prebuild` generates. That is React Native's public debug key, so anyone could sign an APK that installs over this one; a private release keystore is not set up yet. The Android app has been built but not run on a device or emulator.
- The simulator reaches this Mac's `localhost`. To sync against a scratch server ([server.md § Local servers](server.md#local-servers)), set Settings → Web app address to `http://localhost:6194`. On an Android emulator, run `adb reverse tcp:6195 tcp:6195` first.
- Installing on an iPhone needs signing; with a free Apple account the app stops opening after 7 days.
