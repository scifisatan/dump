# Phone app

Owns `mobile/`. For how a user installs and uses the app, read README § Phone app. It is an Expo (React Native) app for iOS and Android, a personal build that isn't in the App Store or Play Store.

## Layout

- `mobile/` is its own npm package (Expo SDK 57, React Native, Hermes). Its `.npmrc` sets `legacy-peer-deps`, because TinyBase lists optional peers (its React UI module, other databases) that ask for a newer React than React Native pins.
- `index.ts` loads `src/runtime.ts` first, then the app.
- `src/runtime.ts` supplies the web APIs Hermes lacks (see [Runtime](#runtime)) and the Origin header.
- `src/origin.ts` keeps the owner's choice of web app origin (Settings → Web app address); `src/core/origin.ts` decides the origin each request presents.
- `src/settings.ts` is a value in expo-sqlite's key-value store. It imports nothing that needs the runtime shims, so `src/runtime.ts` can use it.
- `src/platform.ts` is the phone `ClientPlatform`: one expo-sqlite database per notebook (`dump-v1-<profile-id>.db`, TinyBase JSON in the `notebook` table), AppState and expo-network events, and no tabs.
- `src/profiles.ts` keeps the profile registry in the key-value store (`dump-connections`) and owner keys in expo-secure-store (Keychain on iOS, Keystore on Android).
- `src/notebook.ts` is the open notebook: the core's session (`src/core/session.ts`) for launching, switching, connecting and signing in.
- `src/views.ts` lays the core's views ([core.md § Views](core.md#views)) out as rows for the inverted list. → `tests/views.test.ts`
- `src/App.tsx` (native stack navigation), `src/screens/`, `src/DumpRow.tsx`, `src/Composer.tsx`, `src/menu.tsx`, `src/ui.tsx` and `src/theme.ts` are the UI.
- `metro.config.js` watches `../src` and resolves packages from `mobile/node_modules`, so TinyBase and Zod load once even for files under `../src`. `tsconfig.json` maps them to the same copies for types.
- `ios/`, `android/` and `dist/` are generated and not committed. Configure native settings in `app.json`; `npx expo prebuild` regenerates the native projects.
- The app calls the core's commands directly. Notebook behavior goes in `src/core`, never under `mobile/`.

## Runtime

- `src/core` runs here in Hermes. Hermes and React Native provide timers, `fetch`, `WebSocket` and `TextEncoder`; `src/runtime.ts` adds `crypto` (from expo-crypto), `structuredClone`, `URL`, `URLSearchParams` and `DOMException` (from core-js), and abort reasons, `throwIfAborted`, `AbortSignal.timeout` and `AbortSignal.any`. When the core needs another web API, add it here and in `mac/engine/polyfills.ts`. No automated test runs Hermes.
- Hermes's `TextEncoder` matches browsers byte for byte, lone surrogates included (U+FFFD), which TinyBase's hashes need. This was checked by hand in the simulator; no test can check it.
- Servers refuse requests without an allowed `Origin`. `src/runtime.ts` wraps `fetch` and `WebSocket` so that requests whose path starts with `/api/` present the web app origin, as the Mac app does: the override, else the one `src/core/origin.ts` picks for that server. Other requests, such as Metro's in development, are left alone. No test can check this; Settings shows a refused origin's 403.

## Behavior

- The first launch opens a notebook on this phone right away, as the Mac does, and Settings greets the owner.
- The app opens on home, the root of the stack: the Dump mark at the top left, and Search and Settings at the top right of every view. Settings carries a badge (iOS 26) or a dot (Android) while sync needs attention (offline, paused, signed out, or unable to save); the Settings screen shows the state and Retry. Search searches everything and, before you type, lists the lists (with New List) and Done; choosing one replaces Search, so going back returns home. A row's list name opens that list.
- Each view is a list with the newest at the bottom and a composer pinned above the keyboard. Home ends in Today, just above the composer, with older days above it and a link to Done at the very top. An empty Today shows a sun, "A clear day." and how to give a dump a day, with nothing to click. → `tests/views.test.ts` "marks an empty Today as quiet" It opens at the bottom, or with Today's heading at the top when Today is taller than the screen. Lists and Done are grouped by day. Return adds a line; the send button saves and keeps the keyboard up. It saves one frame after the press, because iOS applies a pending autocorrection as the tap ends and that change reaches JS just after the press: the dump gets the corrected word and the day it names, and the correction can't refill the cleared composer. No test can check this; it was checked by hand in the simulator. Use a different typo for each try, because iOS learns a saved typo and stops correcting it. A list view captures into its list, and a `!list` prefix wins. Done has no composer. No test runs the screens.
- Days: the composer shows the day it read from the draft, and its × saves without it. A dated row shows its day, red when overdue; tapping it opens Pick a Day, a sheet where a day is typed as in a dump ("friday", "oct 24") and read by the same parser, with Today, Tomorrow and Clear Date. The long-press menu has the same choices.
- Rows: the circle marks done. A long press opens every action (open link, done, date, move, copy, remove). Swiping right marks done; swiping left reveals Remove, which needs a tap because there is no undo.
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
