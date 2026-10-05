# Deploy and release

Owns the deploy tasks under `run.tasks` in `vite.config.ts`, the routes in `wrangler.jsonc` and `wrangler.client.jsonc`, and the versions in `mac/Info.plist` and `mobile/package.json`. Everything here publishes or installs something, so do it only when Abi asks. For a fork's deploy guide, read README § Deploy your server.

## Deploy

- `npx vp run deploy:server` deploys the API Worker to `dump-api.abishrestha.com.np`, and `npx vp run deploy:client` deploys the static web app to `dump.abishrestha.com.np`. Both run lint, unit tests and type checks first. Prefix them with `CI=1` for plain output.
- When a change touches the API contract (`src/shared/`, routes, the ping shape), deploy the server first, then the client, then rebuild the Mac app (`npm run mac:install`).
- To verify, run `curl -H 'Origin: https://dump.abishrestha.com.np' https://dump-api.abishrestha.com.np/api/ping`. Without an allowed `Origin`, the server answers 403. `auth` must be `"owner-key"`. To watch logs, run `npx wrangler tail`.
- After a client deploy, open clients and installed PWAs pick up the new build through the app's update notice.
- Never query a hostname before a deploy creates it. Abi's ISP resolver caches "does not exist" for about 30 minutes, which then breaks the browser and the Mac app. To check a new hostname, use `dig +short @1.1.1.1 <host>` and `curl --resolve <host>:443:<ip>`.
- Secrets (`OWNER_KEY`, `JEV_API_KEY`) are set with `npx wrangler secret put` and are write-only: Cloudflare can't show them again. Abi types them in; don't print, search for or store them. `npx wrangler secret list` shows only their names.

## Release vX.Y.Z

1. Work reaches `main` either by a direct push or through a PR, whichever Abi asks for; if it's unclear, ask. Commit messages have an imperative subject, a wrapped body with a bullet list of what changed, and the Co-Authored-By trailer. Split unrelated work into separate commits, and run `npm run check` on each one.
2. Bump the version in all three places, then commit as `Release vX.Y.Z`. The phone app's `app.json` takes its version from `mobile/package.json`.
   ```bash
   npm version X.Y.Z --no-git-tag-version
   ```
   ```bash
   plutil -replace CFBundleShortVersionString -string X.Y.Z mac/Info.plist
   ```
   ```bash
   npm --prefix mobile version X.Y.Z --no-git-tag-version
   ```
   `build-app.sh` sets `CFBundleVersion` to the commit hash at build time.
3. Deploy, server first (see above), then run `npm run mac:install`.
4. Zip the Mac app, and build the Android APK ([mobile.md](mobile.md#build-and-check) has the Java and SDK setup). Prebuild again after the bump, so the APK carries the new version. Building only for arm64, which current Android phones use, keeps the APK near 37 MB instead of 100 MB:
   ```bash
   ditto -c -k --sequesterRsrc --keepParent mac/build/Dump.app Dump-X.Y.Z-mac.zip
   ```
   ```bash
   (cd mobile && CI=1 npx expo prebuild -p android --no-install) && (cd mobile/android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a) && cp mobile/android/app/build/outputs/apk/release/app-release.apk Dump-X.Y.Z-android.apk
   ```
5. Tag and publish:
   ```bash
   git tag -a vX.Y.Z -m "Dump vX.Y.Z" && git push origin vX.Y.Z
   ```
   ```bash
   gh release create vX.Y.Z Dump-X.Y.Z-mac.zip Dump-X.Y.Z-android.apk --title "Dump vX.Y.Z" --notes-file notes.md
   ```
   Write the notes in sections: what changed in the web app and server, in the Mac app and in the phone app, and Upgrading. Say that the zip is not notarized, so macOS asks the user to choose Open Anyway in System Settings → Privacy & Security, and that building from source with `npm run mac:install` is the recommended path. Say that the APK is sideloaded (Android asks to allow installs from unknown sources) and that there is no iPhone download: installing on an iPhone needs signing, so iPhone users build it themselves or use Expo Go ([README § Phone app](../README.md#phone-app)).
