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

- `src/core` runs here in Hermes. Hermes and React Native provide timers, `fetch`, `WebSocket` and `TextEncoder`; `src/runtime.ts` adds `crypto` (from expo-crypto), `structuredClone`, `URL`, `URLSearchParams` and `DOMException` (from core-js), and abort reasons, `throwIfAborted`, `AbortSignal.timeout` and `AbortSignal.any`. When the core needs another web API, add it here and in `mac/engine/polyfills.ts`. → no test: nothing automated runs Hermes.
- Hermes's `TextEncoder` matches browsers byte for byte, lone surrogates included (U+FFFD), which TinyBase's hashes need. → no test: checked by hand in the simulator.
- Servers refuse requests without an allowed `Origin`. `src/runtime.ts` wraps `fetch` and `WebSocket` so that requests whose path starts with `/api/` present the web app origin, as the Mac app does: the override, else the one `src/core/origin.ts` picks for that server. Other requests, such as Metro's in development, are left alone. → no test: check it by hand in Settings, which shows a refused origin's 403.

## Behavior

The screens draw `src/views.ts`. Nothing runs the screens themselves; "by hand" means in the simulator.

- The first launch opens a notebook on this phone right away, and Settings greets the owner. → no test: by hand.
- Home is the root of the stack: the Dump mark top left, Search and Settings top right. Settings carries a badge (iOS 26) or a dot (Android) while sync needs attention, and its screen shows the state and Retry. → `tests/views.test.ts` "needs attention when"
- Search finds dumps and, before you type, lists the lists (with New List) and Done; choosing one replaces Search, so back returns home. A row's list name opens that list; a gone list shows home. → `tests/views.test.ts` "finds every word", "names each view"
- Views read bottom up above a composer pinned over the keyboard, grouped by day; Done has no composer. Home ends in Today under older days and a Done link; an empty Today shows a sun, "A clear day." and how to give a dump a day, with nothing to click. → `tests/views.test.ts` "orders rows for an inverted list", "ends home in Today", "marks an empty Today as quiet"
- A view opens at the bottom, or at Today's heading when Today is taller than the screen. → no test: by hand.
- Return adds a line; send saves and keeps the keyboard up. It saves one frame after the press, because iOS applies a pending autocorrection as the tap ends and that change reaches JS just after: the dump gets the corrected word and its day, and the correction can't refill the cleared composer. Use a different typo for each try, because iOS stops correcting a saved typo. → no test: by hand.
- The composer shows the day it read from the draft, and its × saves without it. A dated row shows its day, red when overdue; tapping it opens Pick a Day, which reads a typed day with the capture parser and offers Today, Tomorrow and Clear Date, as the long-press menu does. → `tests/views.test.ts` "marks an open dump overdue", "names a due day from today", `tests/domain.test.ts` "reads the day a capture names"
- The circle marks done; a long press opens every action. Swiping right marks done; swiping left reveals Remove, which needs a tap because there is no undo. → no test: by hand.
- Native menus come from `@react-native-menu/menu`. Expo Go lacks it, so there `src/menu.tsx` opens the same actions in an action sheet. → no test: by hand in Expo Go.
- The web app address in Settings applies as typed. Going to the background saves; sync resumes on return to the foreground or when the network comes back. → no test: by hand.

## Build and check

- `cd mobile && npm install`, then `npm run typecheck`. The root `npm run check` formats and lints `mobile/` but doesn't typecheck or build it.
- iOS simulator: `npm run ios` (prebuild, CocoaPods, Xcode build, launch, Metro). CocoaPods needs `LANG=en_US.UTF-8`.
- Expo Go on a phone: `npx expo start --go` in `mobile/`, then scan the QR code. The phone must reach this Mac over the network.
- Android APK: `npx expo prebuild -p android`, then `./gradlew assembleRelease` in `mobile/android/` with `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"` and `ANDROID_HOME=~/Library/Android/sdk`. Gradle downloads the NDK and CMake on the first build. Release builds embed the JS bundle and are signed with the debug keystore that `expo prebuild` generates. That is React Native's public debug key, so anyone could sign an APK that installs over this one; a private release keystore is not set up yet. → no test: the Android app has been built but never run on a device or emulator.
- The simulator reaches this Mac's `localhost`, so it can join the scratch server ([server.md § Local servers](server.md#local-servers)) at `http://localhost:6195`. On an Android emulator, run `adb reverse tcp:6195 tcp:6195` first.
- Installing on an iPhone needs signing; with a free Apple account the app stops opening after 7 days.
