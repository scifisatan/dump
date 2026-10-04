<p align="center">
  <img src="public/favicon.svg" alt="Dump logo" width="96" height="96">
</p>

<h1 align="center">Dump</h1>

A capture-first home for thoughts and links. Type something, press Enter, and it's saved. Organizing can wait, and with [Jev](docs/architecture.md#why-jev) switched on, Dump files things for you.

Dump is local-first and built for one person. Every capture lands on your device right away, then syncs to your other devices through your own server: a single Cloudflare Durable Object. Everyone uses the same web app at **https://dump.abishrestha.com.np**, connected to their own server or kept on one device. A [Mac app](#mac-app) lets you capture from anywhere.

## Using Dump

Open the web app and choose **Get started**. Then either connect your server (enter its address, choose **Check**, enter the owner key, choose **Connect**) or choose **Just this device**.

| | |
| --- | --- |
| Capture | Type and press Enter. Shift+Enter adds a line, and `/` focuses the composer. |
| File as you type | Start with `!list`. For example, `!buy warm floor lamp #reading` files to Buy and adds the tag `reading`. The default lists are `!ideas`, `!buy`, `!watch`, `!decor` and `!todo`; for list names with spaces, use hyphens: `!weekend-plans`. |
| Auto-file | With Jev on, other dumps show "Sorting…", then move to Jev's pick, or to To do when Jev is unsure. If you file a dump first, your choice wins. |
| Lists | Create them in the sidebar. Edit or delete one with the pencil in its header. |
| Search | Ctrl/Cmd+K |
| Sort the inbox | `1`–`9` pick a list, Right Arrow skips, Backspace removes. |
| Done / remove | Final: there's no undo. |
| Settings | Switch servers, sign in again after the owner key changes, and export or import a JSON backup. |

A device-only notebook never leaves the browser. Safari clears site data after seven days without a visit unless the app is installed to the home screen, so install it and export backups.

## Mac app

A menu bar app: press **⇧⌘Space**, type, press Return. In the panel, Tab or ⌘0–9 picks a list, and Escape closes it but keeps the draft. **Open Notebook** (⌘O) opens a window with your inbox, lists, Done and search; right-click a dump to see every action. The app runs the web app's own core, so it works offline, files with `!list`, lets Jev sort, and syncs with your server.

```bash
npm run mac:install
```

This needs Xcode with Swift 6, and Node. It builds `Dump.app`, puts it in `/Applications` and opens it; run it again to update. The app isn't notarized, so build it on the Mac that runs it. To keep Keychain access to your owner key across rebuilds, put your signing identity (from `security find-identity -v -p codesigning`) in `mac/.env.local`:

```bash
DUMP_SIGN_IDENTITY="Apple Development: Your Name (TEAMID)"
```

## Deploy your server

You need a Cloudflare account (SQLite-backed Durable Objects work on the free plan) and Node.js 22.12+ with `npm install` done.

1. Sign in with `npx wrangler login`, then run `npx wrangler whoami` to see your account ID.
2. In `wrangler.jsonc`, set `account_id`, and set `routes` to a hostname on a domain in your Cloudflare account. With no domain, remove `routes` and set `"workers_dev": true` instead. Leave `ALLOWED_CLIENT_ORIGINS` as it is to use the hosted app, and leave the Durable Object binding and migration alone.
3. Generate an owner key, save it as a secret when prompted, and keep a copy in your password manager. Until a key of at least 32 characters is set, the server refuses every request except `/api/ping`.
   ```bash
   openssl rand -base64 32
   ```
   ```bash
   npx wrangler secret put OWNER_KEY
   ```
4. Optional, for automatic filing: `npx wrangler secret put JEV_API_KEY`.
5. Deploy. This runs lint, tests and type checks first:
   ```bash
   npx vp run deploy:server
   ```
6. Check it. `curl -H 'Origin: https://dump.abishrestha.com.np' https://<your-host>/api/ping` should report `"auth":"owner-key"`. Then connect the web app to your server.

### Security

- Everything except `/api/ping` needs the owner key. Each device enters it once and stores it: in the browser's local storage, or in the Keychain on the Mac.
- Lost a device? Run `npx wrangler secret put OWNER_KEY` again with a new key. Every device is signed out, keeps its notes, and asks for the new key.
- Your server answers only the web app origins listed in `ALLOWED_CLIENT_ORIGINS`. That is browser policy, not authentication; the owner key is what protects your notes.
- Using the hosted app means trusting whoever deploys it, and anyone with access to your Cloudflare account can reach your notes. To avoid that, host the web app yourself: point `wrangler.client.jsonc` at your account and run `npx vp run deploy:client`, or publish the output of `npm run build:client` (`dist/client/`) to any static HTTPS host. Then add that origin to `ALLOWED_CLIENT_ORIGINS`.

## Develop

This needs Node.js 22.12 or later.

```bash
npm install
npm run dev
```

Open http://localhost:6191. This runs the web client (port 6191) and a local API server (port 6190). On first run, choose **Get started → Sync with your server**; the local address and the dev owner key are filled in for you. Local data is separate from production. For automatic filing locally, add `JEV_API_KEY=your-key` to `.env.local`.

- `npm run check` runs the format check, lint, unit tests, type checks and builds.
- `npm run test:e2e` runs the end-to-end tests. Run `npx playwright install chromium` once first.

[docs/architecture.md](docs/architecture.md) explains how it all fits together and why. Coding agents start at [AGENTS.md](AGENTS.md).

## Limitations

- Sync needs WebSockets. Without them, changes wait on the device.
- If two devices edit the same dump, one whole version wins; there's no collaborative text editing.
- Import only adds missing records, so it isn't a full disaster-recovery tool.
- Formats can still change: there's no schema versioning before a stable release.

Not built yet: list reordering, list archiving, AI tagging, durable server-side AI jobs, a scheduled digest, email capture, R2 backups, link previews, a share extension, Raycast and Android clients, and testing on a real phone.
