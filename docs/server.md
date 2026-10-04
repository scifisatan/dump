# API server

Owns `src/server/` and `wrangler.jsonc`. For the deploy steps and security summary written for a fork's owner, read README § Deploy your server. This file holds what you need to change the server safely.

## Shape

- An API-only Worker (`src/server/index.ts`, Hono) and one SQLite-backed `DumpDO` (`src/server/dump-do.ts`, TinyBase's `WsServerDurableObject`, addressed by `idFromName('me')`). It serves no UI.
- Wrangler bundles and runs the Worker; Vite builds only the static client. Keep the two separate: the Cloudflare Vite plugin was deliberately removed. Client and Worker compile with separate tsconfigs (`tsconfig.client.json`, `tsconfig.json`). Browser code imports the contracts in `src/shared/`, never anything under `src/server/`.
- Bindings and secrets are declared in `src/server/env.ts`. After changing bindings, run `npm run typegen`.

## Owner key and tickets

- Every route except `/api/ping` needs the `OWNER_KEY` Worker secret. HTTP sends it as `Authorization: Bearer` and the server compares it in constant time. Browsers can't set WebSocket headers, so `POST /api/sync-ticket` issues a stateless ticket: an HMAC over the expiry and the notebook ID, valid for 60 seconds (`src/server/auth.ts`). → `tests/auth.test.ts`, e2e `connections.spec.ts` "the API needs the owner key"
- A missing key, or one shorter than 32 characters, makes the server refuse access, and `/api/ping` reports `auth: "unconfigured"`.
- The key is a generated deployment secret, not a password the user picks. Rotating it signs out every device, and each device keeps its local data.
- Per-device tokens, pairing and cookies are deliberately not built. Revisit them only with a new threat model.

## Origins

- `ALLOWED_CLIENT_ORIGINS` is a comma-separated allowlist of exact origins (`vars` in `wrangler.jsonc`). It defaults to the hosted app, so forks work unchanged. It applies to HTTP and to WebSocket upgrades, and HTTP preflights are supported (`src/server/origins.ts`). → `tests/connection.test.ts` "allows only listed client origins"
- A request with no `Origin`, or with the server's own origin, gets 403. Non-browser clients (the Mac app) must therefore send an allowed `Origin` as well as the owner key.
- Origin checking is browser policy; the owner key is the authentication.
- Every response sets `nosniff`, `no-referrer`, `X-Frame-Options: DENY` and `Cache-Control: no-store`.

## Jev proxy

- `POST /api/classify` is a stateless proxy. The browser can't call Jev directly: Jev's CORS rejects browser origins, and the key must stay secret. The proxy validates `{ text, lists }`, sends one Choice question (list IDs plus `leave_in_inbox`), checks the answer against the lists it sent, and returns `{ list, confidence }`. The mapping lives in `src/shared/classify.ts`. → `tests/classify.test.ts`
- The route needs the owner key and keeps a coarse per-isolate limit (`CLASSIFY_PER_MINUTE`) as a brake on a runaway client.
- `JEV_API_KEY` turns Jev on. Wrangler loads it from `.env.local` in dev; in production it is a Worker secret.

## Local servers

- The `api` task under `run.tasks` in `vite.config.ts` (started by `npm run dev`) runs `wrangler dev` on 6190, allowing `http://localhost:6191`, with the owner key `dump-local-development-owner-key`. Its data lives in `.wrangler/state`.
- The e2e servers load only `tests/e2e/server.env`, so they never have a Jev key. See [testing.md](testing.md).
- To run a server you can break without touching Abi's dev data: `npx wrangler dev --port 6195 --local-upstream localhost:6195 --persist-to .wrangler/scratch-state --env-file tests/e2e/server.env`. It allows the origin `http://localhost:6194` and uses the e2e owner key. Stop it and delete the state folder when you're done.
- Deploying: [release.md](release.md).
